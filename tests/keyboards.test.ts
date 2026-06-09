import { describe, expect, it } from 'vitest';
import { createMainMenuKeyboard } from '../src/keyboards/mainMenuKeyboard.js';
import { MENU_BUTTONS } from '../src/config/constants.js';
import { createInstallationKeyboard } from '../src/keyboards/installationKeyboard.js';

describe('keyboards', () => {
  it('creates main menu keyboard', () => {
    const keyboard = createMainMenuKeyboard().reply_markup.keyboard;
    expect(keyboard.flat()).toEqual(Object.values(MENU_BUTTONS));
    expect(keyboard.every((row) => row.length <= 2)).toBe(true);
  });

  it('does not create invalid URL button when APP_URL is missing', () => {
    const keyboard = createInstallationKeyboard(undefined).reply_markup.inline_keyboard;
    expect(JSON.stringify(keyboard)).not.toContain('Открыть Strongest OS');
  });
});
