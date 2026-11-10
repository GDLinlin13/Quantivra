/** Residency / immigration status options per country, used for statutory eligibility. */
export interface ResidencyOption { label: string; value: string; prStages?: boolean; }

const OPTIONS: Record<string, ResidencyOption[]> = {
  SG: [
    { label: 'Singapore Citizen', value: 'SC' },
    { label: 'Permanent Resident', value: 'PR', prStages: true },
    { label: 'Employment Pass', value: 'EP' },
    { label: 'S Pass', value: 'SP' },
    { label: 'Work Permit', value: 'WP' },
    { label: 'Other / Foreigner', value: 'OTHER' },
  ],
  AE: [
    { label: 'UAE National (Emirati)', value: 'UAE_NATIONAL' },
    { label: 'GCC National', value: 'GCC_NATIONAL' },
    { label: 'Expatriate (residence visa)', value: 'EXPAT' },
  ],
  HK: [
    { label: 'Hong Kong Permanent Resident', value: 'HK_PR' },
    { label: 'Non-permanent resident / work visa', value: 'HK_NON_PR' },
    { label: 'Exempt from MPF (overseas scheme, or here 13 months or less)', value: 'MPF_EXEMPT' },
  ],
  SA: [
    { label: 'Saudi National', value: 'SAUDI_NATIONAL' },
    { label: 'GCC National', value: 'GCC_NATIONAL' },
    { label: 'Expatriate (Iqama)', value: 'EXPAT' },
  ],
};

const GENERIC: ResidencyOption[] = [
  { label: 'Citizen', value: 'CITIZEN' },
  { label: 'Permanent Resident', value: 'PR' },
  { label: 'Work Visa / Foreigner', value: 'FOREIGNER' },
];

export function residencyOptions(countryCode?: string | null): ResidencyOption[] {
  return (countryCode && OPTIONS[countryCode.toUpperCase()]) || GENERIC;
}

export function defaultResidency(countryCode?: string | null): string {
  return residencyOptions(countryCode)[0].value;
}
