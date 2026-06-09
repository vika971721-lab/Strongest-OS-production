import { Markup } from 'telegraf';
import { CALLBACK_DATA } from '../config/constants.js';

export const createInstallationKeyboard = (appUrl: string | undefined) => {
  const rows = [
    [Markup.button.callback('Android / Chrome', CALLBACK_DATA.installAndroid)],
    [Markup.button.callback('iPhone / Safari', CALLBACK_DATA.installIphone)],
  ];

  if (appUrl) {
    rows.push([Markup.button.url('Открыть Strongest OS', appUrl)]);
  }

  return Markup.inlineKeyboard(rows);
};
