import { UserPlusIcon } from '@heroicons/react/24/outline';
import { usePageSEO } from '@/shared/utils/seo';
import { UkcBrandWordmark } from '@/shared/components/ui/UkcBrandDot';
import CustomerSelfRegisterForm from '@/features/customers/components/CustomerSelfRegisterForm';
import dpcLogo from '../../../../DuotoneFonts/DPSLOGOS/DPC-transparant-white.svg';

/**
 * Public, standalone registration page — the target of the "Customer Mode" QR code.
 * Branded to Duotone Pro Center standards (dark void, anthracite card, cyan glow, Duotone type)
 * to match the public front door (PublicHome / RegisterModal). A customer opens this on their own
 * phone, fills it in, and submits to the public POST /auth/self-register (passwordless student
 * account + activation email).
 */
const QuickRegisterPage = () => {
  usePageSEO({
    title: 'Create your account | Duotone Pro Center Urla',
    description: 'Register to book lessons, rentals and more at Duotone Pro Center Urla.',
    path: '/join',
  });

  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-[#0f1013] text-white">
      {/* Ambient brand glow — quiet, respects reduced motion */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full opacity-40 animate-blob motion-reduce:animate-none"
        style={{ background: 'radial-gradient(circle, rgba(0,168,196,0.22) 0%, rgba(0,168,196,0) 70%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full opacity-30 animate-blob motion-reduce:animate-none"
        style={{ background: 'radial-gradient(circle, rgba(75,79,84,0.5) 0%, rgba(75,79,84,0) 70%)', animationDelay: '3s' }}
      />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-8">
        {/* Brand lockup */}
        <div className="flex flex-col items-center gap-4 pb-7 pt-2">
          <UkcBrandWordmark rootStyle={{ fontSize: '2rem', lineHeight: 1 }} />
          <img src={dpcLogo} alt="Duotone Pro Center Urla" className="h-9 w-auto object-contain opacity-90" />
        </div>

        {/* Card */}
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#1a1c1e] shadow-2xl">
          {/* Gunmetal → void gradient header */}
          <div className="bg-gradient-to-br from-antrasit to-[#0f1013] px-6 py-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-duotone-blue shadow-inner">
                <UserPlusIcon className="h-6 w-6" />
              </div>
              <div>
                <h1 className="m-0 font-duotone-bold-extended text-xl uppercase leading-tight tracking-tight text-white">
                  Create your account
                </h1>
                <p className="m-0 mt-1 font-duotone-regular text-xs text-gray-400">
                  Join Duotone Pro Center Urla
                </p>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="px-6 py-6">
            <CustomerSelfRegisterForm publicMode />
          </div>
        </div>

        {/* Reassurance */}
        <p className="mt-6 text-center text-[11px] uppercase tracking-widest text-gray-600">
          We&apos;ll email a link to set your password
        </p>
      </div>
    </div>
  );
};

export default QuickRegisterPage;
