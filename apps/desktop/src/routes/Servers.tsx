import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, CardContent } from "@githelm/ui";
import type { AddServerInput } from "@githelm/core";
import { addServerSchema } from "@githelm/core";
import { api, ApiError } from "../lib/api";
import { PageHeader } from "../components/domain/PageHeader";
import { ServerRow } from "../components/domain/ServerRow";

export const ServersPage = () => {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);

  const servers = useQuery({
    queryKey: ["servers"],
    queryFn: api.listServers,
  });

  const remove = useMutation({
    mutationFn: api.removeServer,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["servers"] });
      toast.success("Server removed");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Failed to remove server"),
  });

  return (
    <div>
      <PageHeader
        title="Servers"
        description={`${servers.data?.length ?? 0} connected · SSH and cloud targets`}
        actions={
          <Button size="sm" onClick={() => setShowDialog(true)}>
            <Plus className="h-4 w-4" />
            Add server
          </Button>
        }
      />

      <div className="p-6">
        <Card className="overflow-hidden p-0">
          <CardContent className="p-0">
            {(servers.data ?? []).map((s) => (
              <ServerRow
                key={s.id}
                server={s}
                onRemove={(id) => remove.mutate(id)}
              />
            ))}
            {servers.isLoading && (
              <div className="px-4 py-12 text-center text-sm th-text-muted">
                Loading…
              </div>
            )}
            {servers.data && servers.data.length === 0 && !servers.isLoading && (
              <div className="px-4 py-12 text-center text-sm th-text-muted">
                No servers configured.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {showDialog && (
        <AddServerDialog
          onClose={() => setShowDialog(false)}
          onAdded={() => {
            setShowDialog(false);
            void queryClient.invalidateQueries({ queryKey: ["servers"] });
            toast.success("Server added");
          }}
        />
      )}
    </div>
  );
};

interface AddServerDialogProps {
  onClose: () => void;
  onAdded: () => void;
}

const AddServerDialog = ({ onClose, onAdded }: AddServerDialogProps) => {
  const [form, setForm] = useState<AddServerInput>({
    name: "",
    host: "",
    kind: "ssh",
    region: "",
    username: "root",
    credential: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const add = useMutation({
    mutationFn: api.addServer,
    onSuccess: () => onAdded(),
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Failed to add server"),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = addServerSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string") fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    add.mutate(parsed.data);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal
    >
      <form
        onSubmit={submit}
        className="th-bg-elevated th-card w-full max-w-md p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold th-text-title">Add server</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-[var(--th-sf-06)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Name" error={errors.name}>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="production-us-east"
              className="th-input"
            />
          </Field>

          <Field label="Host" error={errors.host}>
            <input
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
              placeholder="203.0.113.42 or host.example.com"
              className="th-input"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Kind" error={errors.kind}>
              <select
                value={form.kind}
                onChange={(e) =>
                  setForm({ ...form, kind: e.target.value as "ssh" | "cloud" })
                }
                className="th-input"
              >
                <option value="ssh">SSH</option>
                <option value="cloud">Cloud</option>
              </select>
            </Field>
            <Field label="Region" error={errors.region}>
              <input
                value={form.region ?? ""}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                placeholder="us-east-1"
                disabled={form.kind !== "cloud"}
                className="th-input disabled:opacity-50"
              />
            </Field>
          </div>

          <Field label="Username" error={errors.username}>
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="th-input"
            />
          </Field>

          <Field label="Credential (key or password)" error={errors.credential}>
            <input
              type="password"
              value={form.credential}
              onChange={(e) =>
                setForm({ ...form, credential: e.target.value })
              }
              placeholder="Stored in OS keychain"
              className="th-input"
            />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" type="submit" disabled={add.isPending}>
            {add.isPending ? "Adding…" : "Add server"}
          </Button>
        </div>
      </form>
    </div>
  );
};

const Field = ({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) => (
  <label className="block">
    <span className="mb-1 block text-xs font-medium th-text-muted">{label}</span>
    {children}
    {error && <span className="mt-1 block text-xs text-red-500">{error}</span>}
  </label>
);