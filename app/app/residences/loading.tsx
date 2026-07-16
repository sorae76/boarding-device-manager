export default function ResidencesLoading() {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-brand">Residence Management</p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-950">Residences</h1>
      </div>
      <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-neutral-600">Loading residences...</p>
      </div>
    </div>
  );
}
