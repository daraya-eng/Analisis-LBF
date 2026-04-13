"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { api, apiFetch } from "@/lib/api";
import {
  Shield, Plus, Pencil, Trash2, X, Check, Eye, EyeOff,
  UserPlus, Users, ChevronDown, ChevronUp, ToggleLeft, ToggleRight,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface UserData {
  username: string;
  display_name: string;
  role: string;
  modules: string[];
  active: boolean;
}

interface ModuleInfo {
  id: string;
  label: string;
}

const ROLE_OPTIONS = [
  { value: "superadmin", label: "Super Admin", color: "#F59E0B", desc: "Acceso total + gestionar usuarios" },
  { value: "admin", label: "Admin", color: "#3B82F6", desc: "Acceso a modulos asignados" },
  { value: "gerente", label: "Gerente", color: "#10B981", desc: "Acceso a modulos asignados" },
  { value: "viewer", label: "Viewer", color: "#64748B", desc: "Solo lectura, modulos asignados" },
];

/* ─── Main Component ─────────────────────────────────────────────────────── */

export default function AdminPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [usersRes, modulesRes] = await Promise.all([
        api.get<{ users: UserData[] }>("/api/auth/users", { noCache: true }),
        api.get<{ modules: ModuleInfo[] }>("/api/auth/modules", { noCache: true }),
      ]);
      setUsers(usersRes.users);
      setModules(modulesRes.modules);
    } catch {
      setError("Error cargando datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (currentUser?.role !== "superadmin") {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#64748B" }}>
        <Shield size={48} style={{ margin: "0 auto 16px", opacity: 0.3 }} />
        <h2 style={{ fontSize: 18 }}>Acceso Denegado</h2>
        <p>Solo Super Admin puede gestionar usuarios.</p>
      </div>
    );
  }

  const activeUsers = users.filter((u) => u.active).length;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0F172A", margin: 0 }}>
            <Shield size={22} style={{ display: "inline", marginRight: 8, verticalAlign: "text-bottom", color: "#F59E0B" }} />
            Gestionar Usuarios
          </h1>
          <p style={{ color: "#64748B", margin: "4px 0 0", fontSize: 14 }}>
            {activeUsers} usuarios activos de {users.length} total
          </p>
        </div>
        <button
          onClick={() => { setEditingUser(null); setShowForm(true); setError(""); }}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 20px", borderRadius: 10, border: "none",
            background: "linear-gradient(135deg, #3B82F6, #4F46E5)",
            color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}
        >
          <UserPlus size={16} /> Nuevo Usuario
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div style={{ padding: "12px 16px", background: "#FEF2F2", color: "#DC2626", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ padding: "12px 16px", background: "#F0FDF4", color: "#16A34A", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          {success}
          <button onClick={() => setSuccess("")} style={{ float: "right", background: "none", border: "none", cursor: "pointer", color: "#16A34A" }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <UserForm
          user={editingUser}
          modules={modules}
          onClose={() => setShowForm(false)}
          onSaved={(msg) => {
            setShowForm(false);
            setSuccess(msg);
            loadData();
            setTimeout(() => setSuccess(""), 4000);
          }}
          onError={setError}
        />
      )}

      {/* Users table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>Cargando...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {users.map((u) => (
            <UserCard
              key={u.username}
              user={u}
              modules={modules}
              isSelf={u.username === currentUser?.username}
              onEdit={() => { setEditingUser(u); setShowForm(true); setError(""); }}
              onToggleActive={async () => {
                try {
                  await api.put(`/api/auth/users/${encodeURIComponent(u.username)}`, { active: !u.active });
                  setSuccess(`${u.display_name} ${u.active ? "desactivado" : "activado"}`);
                  loadData();
                  setTimeout(() => setSuccess(""), 3000);
                } catch { setError("Error actualizando usuario"); }
              }}
              onDelete={async () => {
                if (!confirm(`Eliminar permanentemente a ${u.display_name}?`)) return;
                try {
                  await api.delete(`/api/auth/users/${encodeURIComponent(u.username)}`);
                  setSuccess(`${u.display_name} eliminado`);
                  loadData();
                  setTimeout(() => setSuccess(""), 3000);
                } catch { setError("Error eliminando usuario"); }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── User Card ──────────────────────────────────────────────────────────── */

function UserCard({ user, modules, isSelf, onEdit, onToggleActive, onDelete }: {
  user: UserData;
  modules: ModuleInfo[];
  isSelf: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const roleInfo = ROLE_OPTIONS.find((r) => r.value === user.role) ?? ROLE_OPTIONS[3];
  const moduleLabels = modules.filter((m) => user.modules.includes(m.id));

  return (
    <div style={{
      background: "white", borderRadius: 12, border: "1px solid #E2E8F0",
      overflow: "hidden", opacity: user.active ? 1 : 0.6,
      transition: "opacity 0.2s",
    }}>
      {/* Main row */}
      <div
        style={{
          display: "flex", alignItems: "center", padding: "16px 20px", gap: 16,
          cursor: "pointer",
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Avatar */}
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: `${roleInfo.color}18`,
          color: roleInfo.color,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 700, flexShrink: 0,
        }}>
          {user.display_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
        </div>

        {/* Name + username */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#0F172A" }}>
            {user.display_name}
            {isSelf && <span style={{ fontSize: 11, color: "#3B82F6", marginLeft: 8 }}>(tu)</span>}
          </div>
          <div style={{ fontSize: 13, color: "#64748B" }}>{user.username}</div>
        </div>

        {/* Role badge */}
        <div style={{
          padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
          background: `${roleInfo.color}15`, color: roleInfo.color,
        }}>
          {roleInfo.label}
        </div>

        {/* Module count */}
        <div style={{ fontSize: 13, color: "#94A3B8", minWidth: 90, textAlign: "center" }}>
          {user.role === "superadmin" ? "Todos" : `${user.modules.length} modulos`}
        </div>

        {/* Status */}
        <div style={{
          width: 8, height: 8, borderRadius: 4, flexShrink: 0,
          background: user.active ? "#10B981" : "#EF4444",
        }} title={user.active ? "Activo" : "Inactivo"} />

        {/* Expand arrow */}
        {expanded ? <ChevronUp size={16} color="#94A3B8" /> : <ChevronDown size={16} color="#94A3B8" />}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: "0 20px 16px", borderTop: "1px solid #F1F5F9" }}>
          {/* Modules */}
          <div style={{ paddingTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Modulos con acceso
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {user.role === "superadmin" ? (
                <span style={{ fontSize: 13, color: "#F59E0B", fontWeight: 500 }}>
                  Acceso completo a todos los modulos
                </span>
              ) : moduleLabels.length > 0 ? (
                moduleLabels.map((m) => (
                  <span key={m.id} style={{
                    padding: "3px 10px", borderRadius: 6, fontSize: 12,
                    background: "#F1F5F9", color: "#475569",
                  }}>
                    {m.label}
                  </span>
                ))
              ) : (
                <span style={{ fontSize: 13, color: "#EF4444" }}>Sin modulos asignados</span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 8, border: "1px solid #E2E8F0",
                background: "white", color: "#475569", fontSize: 13, cursor: "pointer",
              }}
            >
              <Pencil size={14} /> Editar
            </button>
            {!isSelf && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleActive(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 14px", borderRadius: 8, border: "1px solid #E2E8F0",
                    background: "white", color: user.active ? "#F59E0B" : "#10B981",
                    fontSize: 13, cursor: "pointer",
                  }}
                >
                  {user.active ? <><ToggleRight size={14} /> Desactivar</> : <><ToggleLeft size={14} /> Activar</>}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 14px", borderRadius: 8, border: "1px solid #FEE2E2",
                    background: "#FEF2F2", color: "#DC2626", fontSize: 13, cursor: "pointer",
                  }}
                >
                  <Trash2 size={14} /> Eliminar
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── User Form (Create / Edit) ──────────────────────────────────────────── */

function UserForm({ user, modules, onClose, onSaved, onError }: {
  user: UserData | null;
  modules: ModuleInfo[];
  onClose: () => void;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const isEdit = !!user;
  const [form, setForm] = useState({
    username: user?.username ?? "",
    display_name: user?.display_name ?? "",
    role: user?.role ?? "viewer",
    password: "",
    modules: user?.modules ?? [],
    active: user?.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const toggleModule = (id: string) => {
    setForm((f) => ({
      ...f,
      modules: f.modules.includes(id)
        ? f.modules.filter((m) => m !== id)
        : [...f.modules, id],
    }));
  };

  const selectAll = () => setForm((f) => ({ ...f, modules: modules.map((m) => m.id) }));
  const selectNone = () => setForm((f) => ({ ...f, modules: [] }));

  const handleSubmit = async () => {
    if (!form.username.trim() || !form.display_name.trim()) {
      onError("Username y nombre son obligatorios");
      return;
    }
    if (!isEdit && !form.password) {
      onError("La contrasena es obligatoria para usuarios nuevos");
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        const body: Record<string, unknown> = {
          display_name: form.display_name,
          role: form.role,
          modules: form.modules,
          active: form.active,
        };
        if (form.password) body.password = form.password;
        await api.put(`/api/auth/users/${encodeURIComponent(user!.username)}`, body);
        onSaved(`${form.display_name} actualizado correctamente`);
      } else {
        await api.post("/api/auth/users", {
          username: form.username,
          password: form.password,
          display_name: form.display_name,
          role: form.role,
          modules: form.modules,
        });
        onSaved(`${form.display_name} creado correctamente`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error guardando";
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div
        style={{
          background: "white", borderRadius: 16, width: 560, maxHeight: "90vh",
          overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: "20px 24px", borderBottom: "1px solid #F1F5F9",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#0F172A" }}>
            {isEdit ? `Editar: ${user!.display_name}` : "Nuevo Usuario"}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8" }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Username */}
          <div>
            <label style={labelStyle}>Username</label>
            <input
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              disabled={isEdit}
              placeholder="ej: jperez"
              style={{ ...inputStyle, ...(isEdit ? { background: "#F8FAFC", color: "#94A3B8" } : {}) }}
            />
          </div>

          {/* Display name */}
          <div>
            <label style={labelStyle}>Nombre completo</label>
            <input
              value={form.display_name}
              onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
              placeholder="ej: Juan Perez"
              style={inputStyle}
            />
          </div>

          {/* Password */}
          <div>
            <label style={labelStyle}>
              {isEdit ? "Nueva contrasena (dejar vacio para no cambiar)" : "Contrasena"}
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPw ? "text" : "password"}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder={isEdit ? "Sin cambios" : "Contrasena segura"}
                style={{ ...inputStyle, paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                style={{
                  position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer", color: "#94A3B8",
                }}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Role */}
          <div>
            <label style={labelStyle}>Rol</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ROLE_OPTIONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setForm((f) => ({ ...f, role: r.value }))}
                  style={{
                    padding: "8px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                    border: form.role === r.value ? `2px solid ${r.color}` : "1px solid #E2E8F0",
                    background: form.role === r.value ? `${r.color}10` : "white",
                    color: form.role === r.value ? r.color : "#64748B",
                    fontWeight: form.role === r.value ? 600 : 400,
                    transition: "all 0.15s",
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>
              {ROLE_OPTIONS.find((r) => r.value === form.role)?.desc}
            </div>
          </div>

          {/* Modules */}
          {form.role !== "superadmin" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label style={{ ...labelStyle, margin: 0 }}>Modulos con acceso</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={selectAll} style={linkBtnStyle}>Todos</button>
                  <button onClick={selectNone} style={linkBtnStyle}>Ninguno</button>
                </div>
              </div>
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6,
                background: "#F8FAFC", borderRadius: 10, padding: 12,
              }}>
                {modules.map((m) => {
                  const checked = form.modules.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleModule(m.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "8px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                        border: checked ? "1px solid #3B82F6" : "1px solid transparent",
                        background: checked ? "#EFF6FF" : "white",
                        color: checked ? "#1D4ED8" : "#64748B",
                        fontWeight: checked ? 500 : 400,
                        transition: "all 0.15s",
                        textAlign: "left",
                      }}
                    >
                      <div style={{
                        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                        border: checked ? "none" : "1.5px solid #CBD5E1",
                        background: checked ? "#3B82F6" : "white",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {checked && <Check size={12} color="white" strokeWidth={3} />}
                      </div>
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {form.role === "superadmin" && (
            <div style={{
              padding: "12px 16px", background: "#FFFBEB", borderRadius: 8,
              fontSize: 13, color: "#92400E", border: "1px solid #FDE68A",
            }}>
              Super Admin tiene acceso completo a todos los modulos y puede gestionar usuarios.
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 24px", borderTop: "1px solid #F1F5F9",
          display: "flex", justifyContent: "flex-end", gap: 10,
        }}>
          <button onClick={onClose} style={{
            padding: "10px 20px", borderRadius: 8, border: "1px solid #E2E8F0",
            background: "white", color: "#64748B", fontSize: 14, cursor: "pointer",
          }}>
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              padding: "10px 24px", borderRadius: 8, border: "none",
              background: saving ? "#94A3B8" : "linear-gradient(135deg, #3B82F6, #4F46E5)",
              color: "white", fontSize: 14, fontWeight: 600, cursor: saving ? "default" : "pointer",
            }}
          >
            {saving ? "Guardando..." : (isEdit ? "Guardar Cambios" : "Crear Usuario")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────────── */

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#374151",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #E2E8F0",
  fontSize: 14,
  color: "#0F172A",
  outline: "none",
  boxSizing: "border-box",
};

const linkBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#3B82F6",
  fontSize: 12,
  cursor: "pointer",
  fontWeight: 500,
  textDecoration: "underline",
};
