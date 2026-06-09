import { Markup } from 'telegraf';
import { MENU_BUTTONS } from '../config/constants.js';

export const createMainMenuKeyboard = () =>
  Markup.keyboard([
    [MENU_BUTTONS.buyAccess, MENU_BUTTONS.myAccess],
    [MENU_BUTTONS.activateCoupon, MENU_BUTTONS.restoreAccess],
    [MENU_BUTTONS.features, MENU_BUTTONS.installation],
    [MENU_BUTTONS.terms, MENU_BUTTONS.support],
  ]).resize();
