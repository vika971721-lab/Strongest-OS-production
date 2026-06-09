import { Markup } from 'telegraf';

export const createAdminKeyboard = () =>
  Markup.inlineKeyboard([[Markup.button.callback('Статус mock-интеграций', 'admin:mock_status')]]);
