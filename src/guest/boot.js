// باید اولین import برنامه باشد: جداسازی ذخیره‌سازی پیش از هر ماژول دیگر نصب می‌شود.
import { installGuestIsolation, purgeStaleGuestData } from "./guestMode.js";
installGuestIsolation();
purgeStaleGuestData();
