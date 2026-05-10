import { CompanyProfileForm } from "@/lib/ui/components/company-profile-form";
import { getCompanyProfile } from "@/lib/state/company-profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const USER_ID = process.env.GMAESTRO_USER_ID ?? "default";

export default async function CompanyProfilePage() {
  const profile = getCompanyProfile(USER_ID);

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-base font-semibold">Company profile</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Grounds every persona that reasons about your customers — Qualifier scores
          against your ICP, Strategist picks angles from your positioning, Writer drafts
          in your voice.
        </p>
        <p className="text-sm italic text-muted-foreground">
          Filling the four required fields is mandatory before workflow runs can dispatch.
        </p>
      </header>

      <CompanyProfileForm initialProfile={profile} />
    </div>
  );
}
