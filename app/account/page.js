"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "../../components/AppShell";
import AccessDenied from "../../components/AccessDenied";
import {
  fileToAvatarUploadFile,
  fetchProtectedImageUrl,
  isProtectedUploadUrl,
} from "../../components/UserAvatar";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { authApi, uploadsApi } from "../../services/api";

export default function AccountPage() {
  const { hasPermission, user, role, refresh } = useAuth();
  const { showToast } = useToast();
  const fileRef = useRef(null);
  const [profile, setProfile] = useState({
    name: "",
    phone: "",
    department: "",
    email: "",
    avatar_url: "",
  });
  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirm: "",
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPass, setSavingPass] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [previewSrc, setPreviewSrc] = useState(null);
  const [availability, setAvailability] = useState({
    status: "Available",
    custom_text: "",
    until: "",
  });
  const [savingStatus, setSavingStatus] = useState(false);

  useEffect(() => {
    const a = user?.availability;
    setAvailability({
      status: a?.status || "Available",
      custom_text: a?.custom || "",
      until: a?.until || "",
    });
  }, [user]);

  async function saveAvailability(e) {
    e.preventDefault();
    if (availability.status === "Custom" && !availability.custom_text.trim()) {
      showToast("Required", "Enter your custom status.", "warning");
      return;
    }
    setSavingStatus(true);
    try {
      const res = await authApi.updateAvailability({
        status: availability.status,
        custom_text:
          availability.status === "Custom"
            ? availability.custom_text.trim()
            : undefined,
        until:
          availability.status !== "Available" && availability.until
            ? availability.until
            : undefined,
      });
      await refresh();
      const moved = res.data?.forwarded || { tickets: [], requests: [] };
      const count =
        (moved.tickets?.length || 0) + (moved.requests?.length || 0);
      showToast(
        "Status Updated",
        count
          ? `Status saved. ${count} item(s) waiting for your Line Manager review were forwarded.`
          : "Your status was updated.",
        "success",
      );
    } catch (err) {
      showToast("Error", err.message || "Could not update status", "error");
    } finally {
      setSavingStatus(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    setProfile({
      name: user.name || "",
      phone: user.phone || "",
      department: user.department || "",
      email: user.email || "",
      avatar_url: user.avatar_url || "",
    });
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;
    const url = profile.avatar_url || user?.avatar_url;
    if (!url) {
      setPreviewSrc(null);
      return undefined;
    }
    if (
      !isProtectedUploadUrl(url) &&
      (url.startsWith("data:") ||
        url.startsWith("blob:") ||
        url.startsWith("http"))
    ) {
      setPreviewSrc(url);
      return undefined;
    }
    fetchProtectedImageUrl(url)
      .then((src) => {
        if (cancelled) {
          if (src?.startsWith("blob:")) URL.revokeObjectURL(src);
          return;
        }
        objectUrl = src;
        setPreviewSrc(src);
      })
      .catch(() => {
        if (!cancelled) setPreviewSrc(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl?.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
    };
  }, [profile.avatar_url, user?.avatar_url]);

  async function onAvatarPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const prepared = await fileToAvatarUploadFile(file);
      const up = await uploadsApi.upload(prepared);
      const url = up.data?.url || null;
      if (!url) throw new Error("Upload did not return a file URL");
      await authApi.updateProfile({
        name: profile.name || user?.name,
        phone: profile.phone,
        avatar_url: url,
      });
      setProfile((p) => ({ ...p, avatar_url: url }));
      await refresh();
      showToast(
        "Photo Updated",
        "Your profile photo was saved securely.",
        "success",
      );
    } catch (err) {
      showToast("Error", err.message || "Could not upload photo", "error");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function saveProfile(e) {
    e.preventDefault();
    if (!user?.id) return;
    setSavingProfile(true);
    try {
      await authApi.updateProfile({
        name: profile.name,
        phone: profile.phone,
        avatar_url: profile.avatar_url || undefined,
      });
      await refresh();
      showToast(
        "Profile Saved",
        "Your profile details were updated.",
        "success",
      );
    } catch (err) {
      showToast("Error", err.message || "Could not update profile", "danger");
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    if (passwords.newPassword.length < 6) {
      showToast(
        "Invalid",
        "New password must be at least 6 characters.",
        "warning",
      );
      return;
    }
    if (passwords.newPassword !== passwords.confirm) {
      showToast(
        "Mismatch",
        "New password and confirmation do not match.",
        "warning",
      );
      return;
    }
    setSavingPass(true);
    try {
      await authApi.changePassword(
        passwords.currentPassword,
        passwords.newPassword,
      );
      setPasswords({ currentPassword: "", newPassword: "", confirm: "" });
      showToast(
        "Password Updated",
        "Your corporate password was changed.",
        "success",
      );
    } catch (err) {
      showToast("Error", err.message || "Could not change password", "error");
    } finally {
      setSavingPass(false);
    }
  }

  if (!hasPermission("account")) {
    return (
      <AppShell title="My Account" subtitle="Profile and password settings.">
        <AccessDenied moduleName="My Account" />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="My Account"
      subtitle="Manage your profile and corporate password."
    >
      <div className="account-card-grid">
        <div className="account-sidebar-box">
          <div className="avatar-wrapper">
            {previewSrc ? (
              <img
                className="avatar-preview-img"
                alt="Profile"
                src={previewSrc}
              />
            ) : (
              <div className="avatar-preview-img avatar-preview-fallback">
                <span
                  className="user-avatar-fallback"
                  style={{
                    width: "100%",
                    height: "100%",
                    fontSize: 36,
                    borderRadius: "50%",
                  }}
                >
                  {(user?.name || "?")
                    .split(/\s+/)
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </span>
              </div>
            )}
            <button
              type="button"
              className="avatar-upload-btn"
              title="Upload profile photo"
              disabled={uploadingAvatar}
              onClick={() => fileRef.current?.click()}
            >
              <i
                className={`fa-solid ${uploadingAvatar ? "fa-spinner fa-spin" : "fa-camera"}`}
              />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              hidden
              onChange={onAvatarPick}
            />
          </div>
          <h3
            style={{ fontSize: 18, marginBottom: 4, color: "var(--text-main)" }}
          >
            {user?.name}
          </h3>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              marginBottom: 12,
            }}
          >
            {user?.department || "—"}
          </p>
          <span className="badge badge-open">{role?.name || "User"}</span>
          <div style={{ marginTop: 10 }}>
            <span
              className={`badge ${
                user?.availability?.status === "On Leave"
                  ? "badge-rejected"
                  : user?.availability?.status === "Available" ||
                      !user?.availability
                    ? "badge-resolved"
                    : "badge-hold"
              }`}
            >
              {user?.availability?.label || "Available"}
            </span>
          </div>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginTop: 14,
              lineHeight: 1.45,
            }}
          >
            Click the camera icon to upload a circular profile photo. It appears
            next to your name across the portal.
          </p>
        </div>

        <div className="account-main-box">
          <div className="account-section-heading">
            <i className="fa-solid fa-circle-dot" />
            <span>My Status</span>
          </div>
          <form
            onSubmit={saveAvailability}
            autoComplete="off"
            style={{ marginBottom: 32 }}
          >
            <div className="form-grid-2">
              <div className="form-group">
                <label htmlFor="availabilityStatus">Status</label>
                <select
                  id="availabilityStatus"
                  className="form-control form-control-select"
                  value={availability.status}
                  onChange={(e) =>
                    setAvailability((a) => ({ ...a, status: e.target.value }))
                  }
                >
                  <option value="Available">Available</option>
                  <option value="In a Meeting">In a Meeting</option>
                  <option value="On Break">On Break</option>
                  <option value="On Leave">On Leave</option>
                  <option value="Custom">Custom…</option>
                </select>
              </div>
              {availability.status !== "Available" ? (
                <div className="form-group">
                  <label htmlFor="availabilityUntil">Until (optional)</label>
                  <input
                    id="availabilityUntil"
                    type="date"
                    className="form-control"
                    min={new Date().toISOString().slice(0, 10)}
                    value={availability.until}
                    onChange={(e) =>
                      setAvailability((a) => ({ ...a, until: e.target.value }))
                    }
                  />
                </div>
              ) : null}
            </div>
            {availability.status === "Custom" ? (
              <div className="form-group">
                <label htmlFor="availabilityCustom">Custom Status *</label>
                <input
                  id="availabilityCustom"
                  className="form-control"
                  maxLength={120}
                  placeholder="e.g. Working from home"
                  value={availability.custom_text}
                  onChange={(e) =>
                    setAvailability((a) => ({
                      ...a,
                      custom_text: e.target.value,
                    }))
                  }
                />
              </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={savingStatus}
              >
                <i className="fa-solid fa-floppy-disk" />
                <span>{savingStatus ? "Saving..." : "Save Status"}</span>
              </button>
            </div>
          </form>

          <div className="account-section-heading">
            <i className="fa-regular fa-id-badge" />
            <span>Personal & Work Details</span>
          </div>
          <form
            onSubmit={saveProfile}
            autoComplete="off"
            style={{ marginBottom: 32 }}
          >
            <div className="form-grid-2">
              <div className="form-group">
                <label>Full Name *</label>
                <input
                  className="form-control"
                  required
                  value={profile.name}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, name: e.target.value }))
                  }
                />
              </div>
              <div className="form-group">
                <label>Official Email</label>
                <input
                  className="form-control"
                  disabled
                  value={profile.email}
                />
              </div>
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label>Department</label>
                <input
                  className="form-control"
                  disabled
                  value={profile.department}
                />
              </div>
              <div className="form-group">
                <label>Contact Phone / Extension</label>
                <input
                  className="form-control"
                  placeholder="+92 300 1234567"
                  value={profile.phone}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, phone: e.target.value }))
                  }
                />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={savingProfile}
              >
                <i className="fa-solid fa-floppy-disk" />
                <span>
                  {savingProfile ? "Saving..." : "Save Profile Changes"}
                </span>
              </button>
            </div>
          </form>

          <div className="account-section-heading">
            <i className="fa-solid fa-key" />
            <span>Change Corporate Password</span>
          </div>
          <form onSubmit={changePassword} autoComplete="off">
            <div className="form-group">
              <label>Current Password *</label>
              <input
                type="password"
                className="form-control"
                required
                placeholder="••••••••"
                value={passwords.currentPassword}
                onChange={(e) =>
                  setPasswords((p) => ({
                    ...p,
                    currentPassword: e.target.value,
                  }))
                }
              />
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label>New Password *</label>
                <input
                  type="password"
                  className="form-control"
                  required
                  placeholder="At least 6 characters"
                  value={passwords.newPassword}
                  onChange={(e) =>
                    setPasswords((p) => ({ ...p, newPassword: e.target.value }))
                  }
                />
              </div>
              <div className="form-group">
                <label>Confirm New Password *</label>
                <input
                  type="password"
                  className="form-control"
                  required
                  placeholder="Re-enter new password"
                  value={passwords.confirm}
                  onChange={(e) =>
                    setPasswords((p) => ({ ...p, confirm: e.target.value }))
                  }
                />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={savingPass}
              >
                <i className="fa-solid fa-shield" />
                <span>{savingPass ? "Updating..." : "Update Password"}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
