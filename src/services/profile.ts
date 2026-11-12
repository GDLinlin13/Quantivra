import { supabase } from '../utils/supabase';

/** What a person sets for themselves: the name shown at the top right, a picture, or the colour of the head icon. */
export interface MyProfile { display_name: string | null; avatar_color: string | null; avatar_data: string | null }
export const NO_PROFILE: MyProfile = { display_name: null, avatar_color: null, avatar_data: null };
export const DEFAULT_AVATAR_COLOR = '#4fc3f7';

export const profileService = {
  /** The signed-in person's profile; empty before they set one (or before database update 057). */
  async get(authUserId: string): Promise<MyProfile> {
    const r = await supabase.from('user_profiles').select('display_name, avatar_color, avatar_data').eq('auth_user_id', authUserId).maybeSingle();
    return r.error || !r.data ? NO_PROFILE : (r.data as MyProfile);
  },
  async save(authUserId: string, p: MyProfile) {
    const r = await supabase.from('user_profiles').upsert({
      auth_user_id: authUserId, display_name: (p.display_name || '').trim() || null, avatar_color: p.avatar_color || null,
      avatar_data: p.avatar_data || null, updated_at: new Date().toISOString(),
    }, { onConflict: 'auth_user_id' });
    if (r.error) throw new Error(/user_profiles/i.test(r.error.message) ? 'This needs database update 057 — ask your administrator to run it in Supabase.' : r.error.message);
  },
};

/** A picture file as a small square (128 px) JPEG data address, centred and cropped. */
export async function avatarFromFile(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const size = 128, s = Math.min(img.width, img.height);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
  return c.toDataURL('image/jpeg', 0.85);
}
