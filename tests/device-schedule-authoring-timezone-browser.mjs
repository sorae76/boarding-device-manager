// Run with agent-browser eval --stdin on a fresh device-schedule-authoring-browser.mjs session.
// Browser component QA only: the server is synthetic and bound to loopback.
(async () => {
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  check(location.origin === "http://127.0.0.1:4175", "Synthetic localhost required");
  const pause = () => new Promise((resolve) => setTimeout(resolve, 30));
  const wait = async (condition) => {
    for (let i = 0; i < 300; i++) { if (condition()) return; await pause(); }
    throw new Error("UI wait timed out");
  };
  const button = (name) => [...document.querySelectorAll("button")].find((b) => b.textContent === name);
  const status = () => document.querySelector("[role=status]").textContent;
  const click = async (name) => {
    const b = button(name); check(b && !b.disabled, `Missing/disabled ${name}`);
    b.click(); await pause(); await wait(() => status() !== "Working…");
  };
  const fill = async (label, value) => {
    const element = [...document.querySelectorAll("label")].find((l) => l.textContent.startsWith(label)).querySelector("input");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true })); await pause();
  };
  const inputs = () => JSON.stringify([...document.querySelectorAll("input,select")].map((e) => e.value));
  const errors = [], originalError = console.error;
  console.error = (...args) => { errors.push(args.map(String).join(" ")); originalError(...args); };
  window.addEventListener("unhandledrejection", (e) => errors.push(String(e.reason)));
  await click("Open authoring");
  check(document.body.textContent.includes("Times use America/New_York."), "Initial NY context missing");
  await fill("Schedule name", "NY to LA preserved draft");
  await fill("Effective from", "2030-01-07");
  await fill("Last effective date", "2030-01-14");
  const before = inputs();
  await click("Preview on server");
  check(button("Publish future schedule"), "Initial NY preview missing");
  await fetch("/timezone-los-angeles", { method: "POST" });
  await click("Preview on server");
  check(inputs() === before, "Timezone change lost draft");
  check(!button("Publish future schedule"), "Stale context can publish");
  check(/timezone changed.*Reload.*preview again/i.test(status()), "Reload instruction missing");
  let calls = await fetch("/calls").then((r) => r.json());
  check(!calls.some((c) => c.name === "publishSchedule"), "Unexpected publication");
  await click("Preview on server");
  check(!button("Publish future schedule"), "Repeated preview bypassed reload");
  await click("Reload scope / resolve conflict");
  check(inputs() === before, "Reload lost draft");
  check(document.body.textContent.includes("Times use America/Los_Angeles."), "LA guidance missing");
  check(!button("Publish future schedule"), "Reload alone enabled publication");
  await click("Preview on server");
  check(button("Publish future schedule"), "LA preview did not enable publication");
  check(!document.body.textContent.includes("America/New_York"), "Stale NY label remains");
  const first = document.querySelector("ol li").textContent;
  const format = (timeZone) => new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "medium", timeStyle: "long" })
    .format(new Date("2030-01-07T08:00:00Z"));
  check(first.includes(format("America/Los_Angeles")), `LA local preview missing: ${first}`);
  check(!first.includes(format("America/New_York")), "Preview still renders NY local time");
  await click("Publish future schedule");
  check(status().includes("Future schedule published."), "LA publication failed");
  calls = await fetch("/calls").then((r) => r.json());
  const publications = calls.filter((c) => c.name === "publishSchedule");
  check(publications.length === 1 && publications[0].args[2] === "America/Los_Angeles", "Publication timezone mismatch");
  check(publications[0].args[0].name === "NY to LA preserved draft", "Published draft changed");
  check(errors.length === 0 && window.__errors.length === 0, "Client runtime errors");
  console.error = originalError;
  return { result: "PASS", draftPreserved: true, stalePublicationBlocked: true, reloadAndRepreviewRequired: true,
    displayTimezone: "America/Los_Angeles", publicationTimezone: publications[0].args[2], publicationCalls: publications.length,
    clientErrors: [...errors, ...window.__errors] };
})()
