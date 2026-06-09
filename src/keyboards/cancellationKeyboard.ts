import { Markup } from 'telegraf';
import { CANCEL_BUTTON_TEXT } from '../config/constants.js';

export const createCancellationKeyboard = () => Markup.keyboard([[CANCEL_BUTTON_TEXT]]).resize();
