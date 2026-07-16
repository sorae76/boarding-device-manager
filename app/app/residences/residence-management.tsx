"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";

import {
  addResidenceAction,
  setResidenceActiveAction,
  updateResidenceAction,
  type ResidenceActionState
} from "@/lib/residences/actions";
import type { Residence } from "@/lib/residences/types";

const initialState: ResidenceActionState = {
  status: "idle",
  message: ""
};

function StateMessage({ state }: { state: ResidenceActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p
      className={
        state.status === "success"
          ? "text-sm font-semibold text-green-700"
          : "text-sm font-semibold text-brand"
      }
    >
      {state.message}
    </p>
  );
}

function SubmitButton({
  idleLabel,
  name,
  pendingLabel,
  value,
  variant = "danger"
}: {
  idleLabel: string;
  name?: string;
  pendingLabel: string;
  value?: string;
  variant?: "danger" | "success";
}) {
  const { pending } = useFormStatus();
  const className =
    variant === "success"
      ? "h-10 whitespace-nowrap rounded-md bg-green-700 px-4 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
      : "h-10 whitespace-nowrap rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-neutral-400";

  return (
    <button
      className={className}
      disabled={pending}
      name={name}
      type="submit"
      value={value}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

function AddResidenceForm({
  onActionState
}: {
  onActionState: (state: ResidenceActionState) => void;
}) {
  const [state, formAction] = useFormState(addResidenceAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "idle") {
      return;
    }

    onActionState(state);

    if (state.status === "success") {
      formRef.current?.reset();
      router.refresh();
    }
  }, [onActionState, router, state]);

  return (
    <form
      action={formAction}
      className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm"
      onSubmit={() => onActionState(initialState)}
      ref={formRef}
    >
      <div>
        <div>
          <h2 className="text-lg font-semibold text-neutral-950">Add residence</h2>
          <p className="mt-1 text-sm text-neutral-600">
            New residences are active by default.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Name</span>
          <input
            className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm"
            name="name"
            required
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Code</span>
          <input
            className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm"
            name="code"
            required
          />
        </label>
        <SubmitButton idleLabel="Add residence" pendingLabel="Adding..." />
      </div>
    </form>
  );
}

function EditResidenceForm({
  onActionState,
  onCancel,
  onSaved,
  residence
}: {
  onActionState: (state: ResidenceActionState) => void;
  onCancel: () => void;
  onSaved: () => void;
  residence: Residence;
}) {
  const [state, formAction] = useFormState(updateResidenceAction, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "idle") {
      return;
    }

    onActionState(state);

    if (state.status === "success") {
      onSaved();
      router.refresh();
    }
  }, [onActionState, onSaved, router, state]);

  return (
    <form action={formAction} className="space-y-3" onSubmit={() => onActionState(initialState)}>
      <input name="residenceId" type="hidden" value={residence.id} />
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Name</span>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            defaultValue={residence.name}
            name="name"
            required
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Code</span>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            defaultValue={residence.code ?? ""}
            name="code"
            required
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span />
        <div className="flex gap-2">
          <button
            className="h-10 rounded-md border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <SubmitButton idleLabel="Save residence" pendingLabel="Saving..." />
        </div>
      </div>
    </form>
  );
}

function ResidenceStatusForm({
  onActionState,
  residence
}: {
  onActionState: (state: ResidenceActionState) => void;
  residence: Residence;
}) {
  const nextIsActive = !residence.is_active;
  const statusAction = setResidenceActiveAction.bind(null, residence.id, nextIsActive);
  const [state, formAction] = useFormState(statusAction, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "idle") {
      return;
    }

    onActionState(state);

    if (state.status === "success") {
      router.refresh();
    }
  }, [onActionState, router, state]);

  return (
    <form action={formAction} onSubmit={() => onActionState(initialState)}>
      <SubmitButton
        idleLabel={nextIsActive ? "Reactivate" : "Deactivate"}
        pendingLabel={nextIsActive ? "Reactivating..." : "Deactivating..."}
        variant={nextIsActive ? "success" : "danger"}
      />
    </form>
  );
}

export default function ResidenceManagement({
  canManage,
  residences
}: {
  canManage: boolean;
  residences: Residence[];
}) {
  const [editingResidenceId, setEditingResidenceId] = useState<string | null>(null);
  const [actionState, setActionState] = useState<ResidenceActionState>(initialState);
  const handleActionState = useCallback((nextState: ResidenceActionState) => {
    setActionState(nextState);
  }, []);
  const finishEditing = useCallback(() => {
    setEditingResidenceId(null);
  }, []);

  return (
    <div className="space-y-5">
      {canManage ? <AddResidenceForm onActionState={handleActionState} /> : null}

      <StateMessage state={actionState} />

      {!canManage ? (
        <div className="rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-600">
          You can view residences, but your role cannot add or update them.
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Code</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {residences.map((residence) => {
              const isEditing = editingResidenceId === residence.id;

              if (isEditing) {
                return (
                  <tr key={residence.id}>
                    <td className="px-4 py-3" colSpan={4}>
                      <EditResidenceForm
                        onActionState={handleActionState}
                        onCancel={() => setEditingResidenceId(null)}
                        onSaved={finishEditing}
                        residence={residence}
                      />
                    </td>
                  </tr>
                );
              }

              return (
                <tr
                  className={residence.is_active ? "hover:bg-neutral-50" : "bg-neutral-50 text-neutral-500"}
                  key={residence.id}
                >
                  <td className="px-4 py-3">
                    <span className="font-semibold text-neutral-900">{residence.name}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-700">
                    {residence.code}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        residence.is_active
                          ? "rounded-full bg-green-50 px-2 py-1 text-xs font-semibold text-green-700"
                          : "rounded-full bg-neutral-200 px-2 py-1 text-xs font-semibold text-neutral-700"
                      }
                    >
                      {residence.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {canManage ? (
                      <div className="flex flex-wrap items-start gap-2">
                        <button
                          className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
                          onClick={() => setEditingResidenceId(residence.id)}
                          type="button"
                        >
                          Edit
                        </button>
                        <ResidenceStatusForm
                          onActionState={handleActionState}
                          residence={residence}
                        />
                      </div>
                    ) : null}
                    {!canManage ? (
                      <span className="text-sm text-neutral-500">View only</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {residences.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-neutral-500" colSpan={4}>
                  No residences are available for this school.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
