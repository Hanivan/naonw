import type { Page } from "puppeteer-core";

export async function detectDialog(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    function isVisible(el: Element): boolean {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    }
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]'));
    return dialogs.some(isVisible);
  });
}

export async function detectCaptcha(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const CAPTCHA_ID_PREFIXES = ["captcha", "recaptcha", "hcaptcha", "cf-challenge", "turnstile"];
    const CAPTCHA_CLASS_PREFIXES = ["g-recaptcha", "h-captcha", "cf-turnstile", "captcha", "recaptcha"];

    function isVisible(el: Element): boolean {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    }

    const captchaEls = Array.from(document.querySelectorAll("[id],[class]"));

    const hasId = captchaEls.some((el) => {
      if (!el.id) return false;
      const id = el.id.toLowerCase();
      return CAPTCHA_ID_PREFIXES.some((p) => id.startsWith(p) || id.includes(p)) && isVisible(el);
    });

    const hasClass = captchaEls.some((el) => {
      const classes = Array.from(el.classList).map((c) => c.toLowerCase());
      return classes.some((cls) => CAPTCHA_CLASS_PREFIXES.some((p) => cls.startsWith(p) || cls.includes(p))) && isVisible(el);
    });

    const hasTitle = /captcha|unusual traffic|robot|verify you are human/i.test(document.title);

    return hasId || hasClass || hasTitle;
  });
}
