// Tiny i18n: a flat dictionary with [en, ru, uk] triples. The chosen
// language lives in the encrypted vault settings (per profile) and is
// cached in localStorage (not a secret) so the lock screens are already
// localized before any vault is open.

export type Lang = "en" | "ru" | "uk";

const IDX: Record<Lang, number> = { en: 0, ru: 1, uk: 2 };

export const LANGUAGES: { value: Lang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "ru", label: "Русский" },
  { value: "uk", label: "Українська" },
];

const DICT = {
  // common
  add: ["Add", "Добавить", "Додати"],
  save: ["Save", "Сохранить", "Зберегти"],
  cancel: ["Cancel", "Отмена", "Скасувати"],
  back: ["Back", "Назад", "Назад"],
  edit: ["Edit", "Редактировать", "Редагувати"],
  del: ["Delete", "Удалить", "Видалити"],
  copy: ["Copy", "Копировать", "Копіювати"],
  copied: ["Copied", "Скопировано", "Скопійовано"],
  show: ["Show", "Показать", "Показати"],
  hide: ["Hide", "Скрыть", "Приховати"],
  clear: ["Clear", "Очистить", "Очистити"],
  close: ["Close", "Закрыть", "Закрити"],

  // titlebar
  settings: ["Settings", "Настройки", "Налаштування"],
  minimize: ["Minimize", "Свернуть", "Згорнути"],
  maximize: ["Maximize", "Развернуть", "Розгорнути"],

  // profiles
  chooseProfile: ["Choose a profile", "Выберите профиль", "Оберіть профіль"],
  newProfile: ["New profile", "Новый профиль", "Новий профіль"],
  renameProfile: ["Rename profile", "Переименовать профиль", "Перейменувати профіль"],
  deleteProfile: ["Delete profile", "Удалить профиль", "Видалити профіль"],
  deleteProfileConfirm: [
    "Delete profile “{name}”?\nAll its data will be lost forever.",
    "Удалить профиль «{name}»?\nВсе его данные будут потеряны навсегда.",
    "Видалити профіль «{name}»?\nУсі його дані буде втрачено назавжди.",
  ],

  // create profile
  profileName: ["Profile name", "Имя профиля", "Ім'я профілю"],
  profileNamePh: ["e.g. Misha", "например, Миша", "наприклад, Мишко"],
  masterPassword: ["Master password", "Мастер-пароль", "Майстер-пароль"],
  repeatPassword: ["Repeat password", "Повторите пароль", "Повторіть пароль"],
  createBtn: ["Create", "Создать", "Створити"],
  creating: ["Creating…", "Создание…", "Створення…"],
  noRecoveryWarning: [
    "⚠ The master password cannot be recovered. If you forget it, the data is lost. Write it down and keep it safe.",
    "⚠ Мастер-пароль невозможно восстановить. Если вы его забудете — данные будут потеряны. Запишите его и храните в надёжном месте.",
    "⚠ Майстер-пароль неможливо відновити. Якщо ви його забудете — дані буде втрачено. Запишіть його та зберігайте в надійному місці.",
  ],
  errNameRequired: ["Profile name is required", "Укажите имя профиля", "Вкажіть ім'я профілю"],
  errPasswordRequired: ["Master password is required", "Укажите мастер-пароль", "Вкажіть майстер-пароль"],
  errPasswordsMismatch: ["Passwords do not match", "Пароли не совпадают", "Паролі не збігаються"],
  errProfileExists: [
    "A profile with this name already exists",
    "Профиль с таким именем уже существует",
    "Профіль із таким ім'ям вже існує",
  ],
  errInvalidName: [
    "Only letters, digits, spaces, - and _ are allowed",
    "Допустимы только буквы, цифры, пробелы, - и _",
    "Дозволені лише літери, цифри, пробіли, - та _",
  ],

  // unlock
  unlockBtn: ["Unlock", "Разблокировать", "Розблокувати"],
  unlocking: ["Unlocking…", "Разблокировка…", "Розблокування…"],

  // strength
  strength1: ["Weak", "Слабый", "Слабкий"],
  strength2: ["Fair", "Средний", "Середній"],
  strength3: ["Good", "Хороший", "Хороший"],
  strength4: ["Strong", "Надёжный", "Надійний"],

  // nav
  navPasswords: ["Passwords", "Пароли", "Паролі"],
  navPasskeys: ["Passkeys", "Ключи", "Ключі"],
  navCards: ["Credit Cards", "Банковские карты", "Банківські картки"],
  navNotes: ["Secure Notes", "Заметки", "Нотатки"],
  navGenerator: ["Generator", "Генератор", "Генератор"],
  lock: ["Lock", "Заблокировать", "Заблокувати"],

  // drag hint
  hintPress: ["press", "нажмите", "натисніть"],
  hintCancelDrag: ["to cancel drag", "чтобы отменить перенос", "щоб скасувати перенесення"],

  // lists
  searchPh: ["Search…  (Ctrl+F)", "Поиск…  (Ctrl+F)", "Пошук…  (Ctrl+F)"],
  dragToReorder: ["Drag to reorder", "Перетащите, чтобы изменить порядок", "Перетягніть, щоб змінити порядок"],
  openUrl: ["Open URL", "Открыть ссылку", "Відкрити посилання"],
  copyUrl: ["Copy URL", "Копировать ссылку", "Копіювати посилання"],
  copyPassword: ["Copy password", "Копировать пароль", "Копіювати пароль"],
  copyNumber: ["Copy number (no dashes)", "Копировать номер (без дефисов)", "Копіювати номер (без дефісів)"],
  copyCvv: ["Copy CVV", "Копировать CVV", "Копіювати CVV"],
  copyKey: ["Copy key", "Копировать ключ", "Копіювати ключ"],
  showNumber: ["Show number", "Показать номер", "Показати номер"],
  hideNumber: ["Hide number", "Скрыть номер", "Приховати номер"],
  emptyPasswords: [
    "No passwords yet — add your first one.",
    "Пока нет паролей — добавьте первый.",
    "Поки немає паролів — додайте перший.",
  ],
  emptyKeys: ["No keys yet.", "Пока нет ключей.", "Поки немає ключів."],
  emptyCards: ["No cards yet.", "Пока нет карт.", "Поки немає карток."],
  emptyNotes: ["No notes yet.", "Пока нет заметок.", "Поки немає нотаток."],
  nothingMatches: ["Nothing matches “{q}”.", "Ничего не найдено по «{q}».", "Нічого не знайдено за «{q}»."],
  deleteEntryConfirm: ["Delete “{name}”?", "Удалить «{name}»?", "Видалити «{name}»?"],

  // forms
  newEntry: ["New entry", "Новая запись", "Новий запис"],
  editEntry: ["Edit entry", "Редактирование записи", "Редагування запису"],
  fTitle: ["Title", "Название", "Назва"],
  fUsername: ["Username", "Логин", "Логін"],
  fMail: ["Mail", "Почта", "Пошта"],
  fPassword: ["Password", "Пароль", "Пароль"],
  fUrl: ["URL", "URL", "URL"],
  fNotes: ["Notes", "Заметки", "Нотатки"],
  newCard: ["New card", "Новая карта", "Нова картка"],
  editCard: ["Edit card", "Редактирование карты", "Редагування картки"],
  fProvider: ["Payment provider", "Платёжная система", "Платіжна система"],
  fCardholder: ["Cardholder", "Держатель карты", "Власник картки"],
  fCardNumber: ["Card number", "Номер карты", "Номер картки"],
  fExpiry: ["Expiry (MM/YY)", "Срок (MM/YY)", "Термін (MM/YY)"],
  newKey: ["New key", "Новый ключ", "Новий ключ"],
  editKey: ["Edit key", "Редактирование ключа", "Редагування ключа"],
  fKey: ["Key", "Ключ", "Ключ"],
  newNote: ["New note", "Новая заметка", "Нова нотатка"],
  editNote: ["Edit note", "Редактирование заметки", "Редагування нотатки"],
  fNote: ["Note", "Заметка", "Нотатка"],

  // generator
  generatorTitle: ["Password generator", "Генератор паролей", "Генератор паролів"],
  length: ["Length", "Длина", "Довжина"],
  lowercase: ["Lowercase (a–z)", "Строчные (a–z)", "Малі літери (a–z)"],
  uppercase: ["Uppercase (A–Z)", "Прописные (A–Z)", "Великі літери (A–Z)"],
  digits: ["Digits (0–9)", "Цифры (0–9)", "Цифри (0–9)"],
  symbols: ["Symbols (!@#…)", "Символы (!@#…)", "Символи (!@#…)"],
  regenerate: ["Regenerate", "Сгенерировать заново", "Згенерувати знову"],
  generate: ["Generate", "Сгенерировать", "Згенерувати"],
  atLeastOneClass: [
    "Enable at least one character class.",
    "Включите хотя бы один набор символов.",
    "Увімкніть хоча б один набір символів.",
  ],

  // settings
  saved: ["Saved", "Сохранено", "Збережено"],
  autoLock: ["Auto-lock after inactivity", "Автоблокировка при бездействии", "Автоблокування при бездіяльності"],
  autoLockHint: ["0 = never lock automatically", "0 = не блокировать автоматически", "0 = не блокувати автоматично"],
  min: ["min", "мин", "хв"],
  sec: ["sec", "сек", "сек"],
  lockOnMinimize: ["Lock when window is minimized", "Блокировать при сворачивании окна", "Блокувати при згортанні вікна"],
  clipboardClear: ["Clear clipboard after copying", "Очищать буфер после копирования", "Очищати буфер після копіювання"],
  clipboardClearHint: ["0 = never clear automatically", "0 = не очищать автоматически", "0 = не очищати автоматично"],
  theme: ["Theme", "Тема", "Тема"],
  light: ["Light", "Светлая", "Світла"],
  dark: ["Dark", "Тёмная", "Темна"],
  language: ["Language", "Язык", "Мова"],
  resetWindow: ["Reset window", "Сбросить окно", "Скинути вікно"],
  resetWindowHint: [
    "Restore the default window size and position",
    "Вернуть размер и позицию окна по умолчанию",
    "Повернути розмір і позицію вікна за замовчуванням",
  ],
  resetBtn: ["Reset", "Сбросить", "Скинути"],
  backupFolder: ["Backup folder", "Папка бэкапа", "Тека бекапу"],
  backupHint: [
    "Point it at a synced folder (Google Drive, Dropbox…) for cloud backup",
    "Укажите синхронизируемую папку (Google Drive, Dropbox…) для облачного бэкапа",
    "Вкажіть синхронізовану теку (Google Drive, Dropbox…) для хмарного бекапу",
  ],
  backupNow: ["Backup now", "Сделать бэкап", "Зробити бекап"],
  backupDone: ["Copied ✓", "Скопировано ✓", "Скопійовано ✓"],
  backupFailedBtn: ["Failed ✗", "Ошибка ✗", "Помилка ✗"],
  choose: ["Choose…", "Выбрать…", "Обрати…"],
  change: ["Change…", "Изменить…", "Змінити…"],
  copyOnSave: ["Copy vault on every save", "Копировать при каждом сохранении", "Копіювати при кожному збереженні"],
  masterPasswordHint: [
    "Re-encrypts the vault with a fresh salt",
    "Перешифрует хранилище с новой солью",
    "Перешифровує сховище з новою сіллю",
  ],
  passwordChanged: ["Password changed ✓", "Пароль изменён ✓", "Пароль змінено ✓"],
  currentPassword: ["Current password", "Текущий пароль", "Поточний пароль"],
  newPassword: ["New password", "Новый пароль", "Новий пароль"],
  repeatNewPassword: ["Repeat new password", "Повторите новый пароль", "Повторіть новий пароль"],
  errCurrentRequired: ["Enter the current password", "Введите текущий пароль", "Введіть поточний пароль"],
  errNewRequired: ["Enter the new password", "Введите новый пароль", "Введіть новий пароль"],
  errNewMismatch: ["New passwords do not match", "Новые пароли не совпадают", "Нові паролі не збігаються"],
  errWrongCurrent: ["Current password is wrong", "Неверный текущий пароль", "Невірний поточний пароль"],
  changePasswordBtn: ["Change password", "Сменить пароль", "Змінити пароль"],
  reencrypting: ["Re-encrypting…", "Перешифровка…", "Перешифрування…"],
  changePwWarning: [
    "⚠ The master password cannot be recovered. If you forget the new one, the data is lost.",
    "⚠ Мастер-пароль невозможно восстановить. Забудете новый — данные будут потеряны.",
    "⚠ Майстер-пароль неможливо відновити. Забудете новий — дані буде втрачено.",
  ],

  // toast
  backupFailedToast: [
    "Backup failed — {err}",
    "Не удалось сделать бэкап — {err}",
    "Не вдалося зробити бекап — {err}",
  ],
} as const;

export type TKey = keyof typeof DICT;

function readCached(): Lang {
  const v = localStorage.getItem("lang");
  return v === "ru" || v === "uk" ? v : "en";
}

let current: Lang = readCached();

export function currentLang(): Lang {
  return current;
}

export function isLang(v: string): v is Lang {
  return v === "en" || v === "ru" || v === "uk";
}

/** Switch the UI language; listeners ("np-lang") re-render the tree. */
export function applyLang(lang: Lang) {
  current = lang;
  localStorage.setItem("lang", lang);
  window.dispatchEvent(new CustomEvent("np-lang"));
}

/** Translate a key; `{var}` placeholders are substituted from `vars`. */
export function t(key: TKey, vars?: Record<string, string>): string {
  let s: string = DICT[key][IDX[current]];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{${k}}`).join(v);
    }
  }
  return s;
}
