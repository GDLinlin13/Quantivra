// Rewrite the SG self-help group rate tables to the real 2026 fixed-amount bands.
// Sources: talenox.com/blog/ecf-sinda-cdac-mbmf-...  &  aimmpayroll.com/guides/shg-contribution-rates-singapore
import { readFileSync, writeFileSync } from 'fs';

const BANDS = {
  cdac: [ [0,2000,0.50], [2000,3500,1.00], [3500,5000,1.50], [5000,7500,2.00], [7500,null,3.00] ],
  ecf:  [ [0,1000,2.00], [1000,1500,4.00], [1500,2500,6.00], [2500,4000,9.00], [4000,7000,12.00], [7000,10000,16.00], [10000,null,20.00] ],
  sinda:[ [0,1000,1.00], [1000,1500,3.00], [1500,2500,5.00], [2500,4500,7.00], [4500,7500,9.00], [7500,10000,12.00], [10000,15000,18.00], [15000,null,30.00] ],
  mbmf: [ [0,1000,3.00], [1000,2000,4.50], [2000,3000,6.50], [3000,4000,15.00], [4000,6000,19.50], [6000,8000,22.00], [8000,10000,24.00], [10000,null,26.00] ],
};
const CAT = { cdac: 'CDAC_MEMBER', ecf: 'ECF_MEMBER', sinda: 'SINDA_MEMBER', mbmf: 'MBMF_MEMBER' };

for (const [code, bands] of Object.entries(BANDS)) {
  const path = new URL(`../src/data/country-packs/SG/statutory/${code}.json`, import.meta.url);
  const j = JSON.parse(readFileSync(path, 'utf8'));
  const cat = CAT[code];
  j.employeeCategories = [{ code: cat, name: j.employeeCategories?.[0]?.name || cat, immigrationStatusCode: null }];
  j.rateTables = bands.map(([min, max, amt]) => ({
    employeeCategory: cat,
    employeeRate: 0, employerRate: 0,
    fixedEmployeeAmount: amt,
    wageMin: min, wageMax: max,
    effectiveDate: '2026-01-01',
  }));
  j.calculationRules = [{
    code: 'SHG_CALC', name: 'Self-Help Group Fixed Contribution', priority: 1,
    action: 'LOOKUP_FIXED_BY_WAGE_BAND(MonthlyTotalWages)',
    description: `Flat monthly amount by total-wage band per ${j.general.code} 2026 schedule (employee-only, remitted with CPF).`,
  }];
  writeFileSync(path, JSON.stringify(j, null, 2) + '\n');
  console.log(code, '→', bands.length, 'bands, top', bands.at(-1)[2]);
}
