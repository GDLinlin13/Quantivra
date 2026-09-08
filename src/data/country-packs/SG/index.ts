import type { CountryPackDef, PublicHolidayDef } from '../schema';
import general from './general.json';
import employment from './employment.json';
import payroll from './payroll.json';
import tax from './tax.json';
import accounting from './accounting.json';
import publicHolidays from './public-holidays.json';
import governmentForms from './government-forms.json';
import documentNumbering from './document-numbering.json';
import workflowTemplates from './workflow-templates.json';
import dashboardWidgets from './dashboard-widgets.json';
import cpf from './statutory/cpf.json';
import sdl from './statutory/sdl.json';
import cdac from './statutory/cdac.json';
import sinda from './statutory/sinda.json';
import mbmf from './statutory/mbmf.json';
import ecf from './statutory/ecf.json';

const pack: CountryPackDef = {
  general,
  employment,
  payroll,
  tax: tax as any,
  accounting,
  publicHolidays: publicHolidays as PublicHolidayDef[],
  governmentForms,
  documentNumbering,
  workflowTemplates,
  dashboardWidgets,
  statutorySchemes: {
    cpf: cpf as any,
    sdl: sdl as any,
    cdac: cdac as any,
    sinda: sinda as any,
    mbmf: mbmf as any,
    ecf: ecf as any,
  },
};

export default pack;
