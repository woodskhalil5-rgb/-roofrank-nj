"use client";

import { useActionState } from "react";
import { changeRole, type RoleState } from "./actions";

const initialState: RoleState = { status: "idle" };

export default function RoleForm({
  userId,
  currentRole,
}: {
  userId: string;
  currentRole: string;
}) {
  const [state, formAction, pending] = useActionState(changeRole, initialState);

  return (
    <>
      <form action={formAction} style={{ display: "flex", gap: 6 }}>
        <input type="hidden" name="userId" value={userId} />
        <select name="role" defaultValue={currentRole} aria-label="Role">
          <option value="owner">owner</option>
          <option value="admin">admin</option>
          <option value="employee">employee</option>
          <option value="readonly">readonly</option>
        </select>
        <button className="btn btn-secondary" type="submit" disabled={pending}>
          {pending ? "…" : "Save"}
        </button>
      </form>
      {state.message ? (
        <div className="hint" style={{ color: state.status === "ok" ? "var(--ok)" : "var(--bad)" }}>
          {state.message}
        </div>
      ) : null}
    </>
  );
}
