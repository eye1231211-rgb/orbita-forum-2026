"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Pencil, Send } from "lucide-react";
import { api } from "./portal-client";

export type GroupProfile = {telegramUrl: string; note: string; canEdit: boolean};

export function GroupPanel({ group, profile, onSaved }: {
  group: string; profile: GroupProfile; onSaved: (profile: GroupProfile) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string,string>>({});
  const editButton = useRef<HTMLButtonElement>(null);
  function close() {
    setEditing(false);
    setErrors({});
    requestAnimationFrame(() => editButton.current?.focus());
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setErrors({});
    try {
      onSaved(await api<GroupProfile>("/api/group-profile", {telegramUrl: form.get("telegramUrl"), note: form.get("note")}));
      close();
      setMessage("Данные группы сохранены.");
    } catch (error) {
      const failure = error as Error & {fields?: Record<string,string>};
      setErrors({form: failure.message, ...failure.fields});
    } finally {
      setBusy(false);
    }
  }
  return <section className="card profile-group" aria-labelledby="my-group-title">
    <div className="section-heading">
      <div><h2 id="my-group-title">Моя группа</h2><p className="profile-section-intro">{group}{profile.canEdit && " · Староста"}</p></div>
      {profile.canEdit && !editing && <button ref={editButton} className="button secondary" type="button" onClick={() => {setMessage(""); setEditing(true);}}>
        <Pencil size={16} aria-hidden="true"/> Редактировать
      </button>}
    </div>
    {editing ? <form className="profile-group-form" onSubmit={save} noValidate>
      <p className="field-hint">Это учебная группа. Используйте тестовые данные и ссылки.</p>
      <div className="field">
        <label htmlFor="group-telegram">Ссылка на Telegram</label>
        <input id="group-telegram" name="telegramUrl" type="url" inputMode="url" maxLength={160} defaultValue={profile.telegramUrl}
          placeholder="https://t.me/…" autoFocus aria-invalid={Boolean(errors.telegramUrl)} aria-describedby={errors.telegramUrl ? "group-telegram-error" : undefined}/>
        {errors.telegramUrl && <span className="field-error" id="group-telegram-error">{errors.telegramUrl}</span>}
      </div>
      <div className="field">
        <label htmlFor="group-note">Заметка для группы</label>
        <textarea id="group-note" name="note" rows={2} maxLength={400} defaultValue={profile.note}
          placeholder="Например, где найти общие материалы" aria-invalid={Boolean(errors.note)} aria-describedby={errors.note ? "group-note-error" : undefined}/>
        {errors.note && <span className="field-error" id="group-note-error">{errors.note}</span>}
      </div>
      {errors.form && <p role="alert" className="field-error">{errors.form}</p>}
      <div className="profile-group-actions">
        <button type="submit" className="button primary" disabled={busy}>{busy ? "Сохраняем…" : "Сохранить"}</button>
        <button type="button" className="button secondary" disabled={busy} onClick={close}>Отмена</button>
      </div>
    </form> : <>
      <div className="profile-chat">
        <span className="profile-resource-icon"><Send size={19} aria-hidden="true"/></span>
        <div><h3>Чат группы в Telegram</h3>
          {profile.telegramUrl
            ? <a className="text-link" href={profile.telegramUrl} target="_blank" rel="noopener noreferrer">Открыть чат <ArrowUpRight size={15} aria-hidden="true"/></a>
            : <p>Староста ещё не добавил ссылку.</p>}
        </div>
      </div>
      {profile.note && <div className="profile-group-note"><h3>Заметка старосты</h3><p>{profile.note}</p></div>}
      {message && <p className="profile-group-status" role="status">{message}</p>}
    </>}
  </section>;
}
