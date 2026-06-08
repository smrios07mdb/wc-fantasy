/**
 * Denied page, re-skinned onto the ds split-shell (Prompt 21) per the `auth/*` DeniedView. Reached when
 * the sign-in link was invalid/expired or the authenticated email is not on the allowlist — so it keeps
 * its DUAL-CAUSE copy (the design's DeniedView is allowlist-only; this route covers both). Stays a server
 * component with no dynamic data (route shape unchanged: `○` static). Shell-free (Prompt 20 boundary) —
 * the brand comes from the AuthScreen panel, not the topbar. The back-to-sign-in affordance is preserved.
 */
import { AuthScreen, IconShield } from "../../_auth/AuthChrome";
import "../../_auth/auth.css";

export default function DeniedPage() {
  return (
    <AuthScreen>
      <div className="au-view au-center">
        <div className="au-icon tone-danger">
          <IconShield s={26} />
        </div>
        {/* Broadened from the design's allowlist-only DeniedView (confirmed Prompt 21): this route is
            dual-cause (allowlist OR expired link), so allowlist-only copy would mislead. Cause-specific
            copy is a future LOGIC prompt, not a skin. */}
        <h1 className="au-title">We can’t sign you in</h1>
        <p className="au-sub">
          This is a private, invite-only league. Your email may not be on the allowlist, or the
          sign-in link expired. If you think that’s a mistake, ask the commissioner for an invite.
        </p>
        <div className="au-actions">
          <a className="btn btn-primary btn-block" href="/sign-in">
            Back to sign in
          </a>
        </div>
      </div>
    </AuthScreen>
  );
}
