// Central provider registry — single source of truth used by both renderer and
// main process (via IPC). Keep provider IDs stable across versions.

export interface ProviderDefinition {
  id: number;
  name: string;
  icon: string;             // relative path from public/
  color: string;
  url: string;
  supportsBackgroundPoll?: boolean; // main-process background polling enabled
}

export const ALL_PROVIDERS: ProviderDefinition[] = [
  { id: 1,  name: 'WhatsApp',      icon: './provider/whatsapp.png',           color: '#25d366', url: 'https://web.whatsapp.com',                   supportsBackgroundPoll: true },
  { id: 2,  name: 'Telegram',      icon: './provider/telegram.png',           color: '#0088cc', url: 'https://web.telegram.org/k/',                supportsBackgroundPoll: true },
  { id: 3,  name: 'Line',          icon: './provider/line.png',               color: '#00b900', url: 'https://line.me' },
  { id: 4,  name: 'Instagram',     icon: './provider/instagram.png',          color: '#e4405f', url: 'https://instagram.com' },
  { id: 5,  name: 'Messenger',     icon: './provider/facebook-messenger.png', color: '#00B2FF', url: 'https://www.messenger.com',                  supportsBackgroundPoll: true },
  { id: 6,  name: 'Facebook',      icon: './provider/facebook.png',           color: '#1877f2', url: 'https://www.facebook.com',                   supportsBackgroundPoll: true },
  { id: 8,  name: 'Discord',       icon: './provider/discord.png',            color: '#5865f2', url: 'https://discord.com/login',                  supportsBackgroundPoll: true },
  { id: 10, name: 'TikTok',        icon: './provider/tiktok.png',             color: '#000000', url: 'https://www.tiktok.com/login' },
  { id: 12, name: 'Teams',         icon: './provider/business.png',           color: '#6264a7', url: 'https://teams.microsoft.com/',               supportsBackgroundPoll: true },
  { id: 13, name: 'Tinder',        icon: './provider/tinder.png',             color: '#e24670', url: 'https://tinder.com/app/login' },
  { id: 14, name: 'Snapchat',      icon: './provider/snapchat.png',           color: '#fffc00', url: 'https://www.snapchat.com/' },
  { id: 15, name: 'LinkedIn',      icon: './provider/linkedin.png',           color: '#0a66c2', url: 'https://www.linkedin.com/login' },
  { id: 16, name: 'Gmail',         icon: './provider/gmail.png',              color: '#ea4335', url: 'https://mail.google.com/',                   supportsBackgroundPoll: true },
  { id: 17, name: 'VK',            icon: './provider/vk.png',                 color: '#4c75a3', url: 'https://vk.com' },
  { id: 19, name: 'DeepSeek',      icon: './provider/deepseek.svg',           color: '#5d5fef', url: 'https://chat.deepseek.com' },
  { id: 20, name: 'ChatGPT',       icon: './provider/chatgpt.png',            color: '#10a37f', url: 'https://chatgpt.com/' },
  { id: 21, name: 'Google Sheets', icon: './provider/google-sheets.png',      color: '#0b57d0', url: 'https://docs.google.com/spreadsheets/' },
  { id: 22, name: 'Google Voice',  icon: './provider/Google_Voice.png',       color: '#0b57d0', url: 'https://voice.google.com/',                  supportsBackgroundPoll: true },
  { id: 23, name: 'X (Twitter)',   icon: './provider/twitter.png',            color: '#000000', url: 'https://twitter.com/login' },
  { id: 24, name: 'Zalo',          icon: './provider/zalo.png',               color: '#0068ff', url: 'https://chat.zalo.me/' },
  { id: 25, name: 'Hangouts',      icon: './provider/hangouts.png',           color: '#0f9d58', url: 'https://hangouts.google.com/' },
  { id: 26, name: 'TextNow',       icon: './provider/textnow.png',            color: '#8839fb', url: 'https://www.textnow.com/login' },
  { id: 27, name: 'Text Free',     icon: './provider/textfree.png',           color: '#6633cc', url: 'https://messages.textfree.us/login' },
  { id: 28, name: 'Slack',         icon: './provider/slack.png',              color: '#4a154b', url: 'https://app.slack.com/client',               supportsBackgroundPoll: true },
];

/** Lookup map for O(1) access */
export const PROVIDER_MAP: Record<number, ProviderDefinition> = Object.fromEntries(
  ALL_PROVIDERS.map(p => [p.id, p])
);

export function getProviderUrl(providerId: number): string {
  return PROVIDER_MAP[providerId]?.url ?? 'about:blank';
}

export function getProviderName(providerId: number): string {
  return PROVIDER_MAP[providerId]?.name ?? `Provider ${providerId}`;
}

export function isBackgroundPollEnabled(providerId: number): boolean {
  return PROVIDER_MAP[providerId]?.supportsBackgroundPoll === true;
}
