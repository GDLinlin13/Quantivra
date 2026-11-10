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
import mpf from './statutory/mpf.json';

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
    mpf: mpf as any,
  },
};

export default pack;
