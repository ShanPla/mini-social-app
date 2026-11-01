import { supabase } from './supabaseClient';
import { markIntentionalSignOut } from './session';
import { clearAllDrafts } from './drafts';

/* The Logout button in the navbar and in Settings */
export async function logOut(): Promise<void> {
  /* So the session watcher does not announce an expired session for this */
  markIntentionalSignOut();
  /* Unfinished post text stays on the device otherwise, so wipe it on shared computers */
  clearAllDrafts();
  await supabase.auth.signOut();
}
