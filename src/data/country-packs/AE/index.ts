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
import gpssa from './statutory/gpssa.json';
import eosb from './statutory/eosb.json';

const pack: CountryPackDef = {
  general,
  employment,
  payroll,
  tax,
  accounting,
  publicHolidays: publicHolidays as PublicHolidayDef[],
  governmentForms,
  documentNumbering,
  workflowTemplates,
  dashboardWidgets,
  statutorySchemes: {
    gpssa: gpssa as any,
    eosb: eosb as any,
  },
};

export default pack;
