import {
  SHORTS_FONTS,
  normalizeShortsFontId,
  type ShortsFontId,
} from "../lib/shortsFonts";

type Props = {
  titleFont: string;
  captionFont: string;
  disabled?: boolean;
  onChange: (next: { titleFont: ShortsFontId | string; captionFont: ShortsFontId | string }) => void;
  /** When set, only show the control for that role (toolbar mode). */
  focusRole?: "title" | "caption";
};

export function FontRolePicker({
  titleFont,
  captionFont,
  disabled,
  onChange,
  focusRole,
}: Props) {
  const titleId = normalizeShortsFontId(titleFont);
  const captionId = normalizeShortsFontId(captionFont);

  function renderSelect(
    role: "title" | "caption",
    value: ShortsFontId,
    label: string,
  ) {
    return (
      <label className="font-role-field">
        {label}
        <select
          className="font-role-select"
          value={value}
          disabled={disabled}
          onChange={(event) => {
            const next = normalizeShortsFontId(event.target.value);
            onChange({
              titleFont: role === "title" ? next : titleId,
              captionFont: role === "caption" ? next : captionId,
            });
          }}
        >
          {SHORTS_FONTS.map((font) => (
            <option key={font.id} value={font.id} style={{ fontFamily: `"${font.family}"` }}>
              {font.label} — {font.hint}
            </option>
          ))}
        </select>
        <span className="font-role-sample" style={{ fontFamily: `"${SHORTS_FONTS.find((f) => f.id === value)?.family}"` }}>
          가나다 ABC
        </span>
      </label>
    );
  }

  return (
    <div className="font-role-picker">
      {!focusRole || focusRole === "title"
        ? renderSelect("title", titleId, "타이틀 폰트")
        : null}
      {!focusRole || focusRole === "caption"
        ? renderSelect("caption", captionId, "자막 폰트")
        : null}
    </div>
  );
}
