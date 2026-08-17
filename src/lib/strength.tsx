// Rough password strength estimate: 0..4 based on length and variety.

export function strength(pw: string): number {
  if (!pw) return 0;
  let classes = 0;
  if (/[a-z]/.test(pw)) classes++;
  if (/[A-Z]/.test(pw)) classes++;
  if (/[0-9]/.test(pw)) classes++;
  if (/[^a-zA-Z0-9]/.test(pw)) classes++;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (classes >= 2) score++;
  if (classes >= 3 && pw.length >= 10) score++;
  return score;
}

import { t } from "./i18n";

export function StrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const score = strength(password);
  const labels = ["", t("strength1"), t("strength2"), t("strength3"), t("strength4")];
  return (
    <div className={`strength strength-${score}`}>
      <div className="strength-bar">
        <div style={{ width: `${(score / 4) * 100}%` }} />
      </div>
      <span>{labels[score]}</span>
    </div>
  );
}
