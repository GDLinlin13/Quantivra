// Plain-language guide shown on the Roles & Permissions screen.

export const MODULE_GUIDE: Record<string, { covers: string; built: boolean }> = {
  company:    { covers: 'Company profile, which modules are switched on, logo and branding (Settings, Company Profile).', built: true },
  employees:  { covers: 'Employee records, their documents and staff reports (HR → Employees).', built: true },
  leave:      { covers: 'Applying for, approving and reporting leave (HR → My Leave, Approvals, Leave Balances).', built: true },
  attendance: { covers: 'Clock-in / clock-out and time logs (HR → My Attendance, Attendance). View: the person clocks themselves in and out. Create / edit / delete: everyone’s hours, with the right to add, correct or remove entries.', built: true },
  claims:     { covers: 'Expense claims (HR). View: My Claims appears and the person can claim for themselves. Approve: the Claims tab appears with everyone’s claims to approve or reject. Create / edit / delete: add, change or remove claims for anyone. Finance records approved claims under Payables → Staff claims.', built: true },
  payroll:    { covers: 'Payroll runs, payslips and pay components (HR → Payroll). Salaries also need the role’s “Can see pay & manage users” switch.', built: true },
  finance:    { covers: 'Invoices, bills, payments, banking, accounts and reports (Finance).', built: true },
  inventory:  { covers: 'Catalog: products and services, prices, stock on hand and stock adjustments.', built: true },
  crm:        { covers: 'Customers and suppliers with their contact people (CRM).', built: true },
  projects:   { covers: 'Projects, tasks, milestones and timesheets (Projects). View: the Projects menu, and logging your own hours. Create / edit / delete: managing projects, tasks and milestones, and everyone’s timesheets.', built: true },
  users:      { covers: 'Logins, roles and permissions. Changing them also needs “Can see pay & manage users”.', built: true },
  workflow:   { covers: 'Approval chains for leave and claims (Workflow): who approves, in which order, and for requests of what size. View: see the chains. Create / edit: change them. Without a chain, anyone with the Approve tick decides.', built: true },
  settings:   { covers: 'Company settings: leave, payroll and approval rules, work week, holidays, document numbers.', built: true },
};

export const ACTION_GUIDE: Record<string, { means: string; example: string; usedNow: boolean }> = {
  view:    { means: 'See this section', example: 'e.g. Leave → view: the HR menu and My Leave appear', usedNow: true },
  create:  { means: 'Add new items', example: 'e.g. Finance → create: add invoices, bills and payments', usedNow: true },
  edit:    { means: 'Change existing items', example: 'e.g. Employees → edit: the Employees, Leave Balances and Leave Types tabs appear', usedNow: true },
  delete:  { means: 'Remove items', example: 'e.g. delete an employee record', usedNow: true },
  approve: { means: 'Approve or reject other people’s requests', example: 'e.g. Leave → approve: the Approvals tab appears', usedNow: true },
  export:  { means: 'Download and report', example: 'e.g. Employees or Finance → export: the Reports menu appears', usedNow: true },
  print:   { means: 'Print documents', example: 'e.g. print payslips or forms', usedNow: false },
  void:    { means: 'Cancel something already issued', example: 'e.g. void an invoice', usedNow: false },
};

/**
 * The ticks that do something, per section, and what each one opens. Sections not listed here
 * (company profile, settings, users, payroll) follow the role's "Can see pay & manage users" switch.
 */
export const PERMISSION_TICKS: Record<string, Partial<Record<string, string>>> = {
  employees: {
    view: 'HR → Employees appears, to look only',
    create: 'Add employees; apply for leave on behalf of anyone',
    edit: 'Add and change employees; Leave Balances and Leave Types appear; apply for leave on behalf of anyone',
    delete: 'Remove employees',
  },
  leave: {
    view: 'HR → My Leave appears: apply for and see your own leave. Managers can also apply for the people who report to them',
    create: 'Apply for leave on behalf of anyone; add time off in lieu; apply around the leave rules with a reason',
    approve: 'HR → Approvals appears: approve or reject leave',
    edit: 'Leave Balances, Leave Types and Leave Policy appear; apply for leave on behalf of anyone; add time off in lieu; apply around the leave rules with a reason',
  },
  attendance: {
    view: 'HR → My Attendance appears: clock in and out, see your own hours',
    create: 'HR → Attendance appears: everyone’s hours; add hours for anyone',
    edit: 'HR → Attendance appears: everyone’s hours; add and correct entries',
    delete: 'Remove attendance entries',
  },
  workflow: {
    view: 'The Workflow menu appears: see the approval chains',
    create: 'Change the approval chains',
    edit: 'Change the approval chains',
  },
  projects: {
    view: 'The Projects menu appears: see projects, and log your own hours',
    create: 'Add and change projects, tasks and milestones; see and fix everyone’s timesheets',
    edit: 'Add, change and remove projects, tasks and milestones; see and fix everyone’s timesheets',
    delete: 'Remove projects, tasks and milestones, and timesheet entries',
  },
  claims: {
    view: 'HR → My Claims appears: submit and see your own claims',
    approve: 'HR → Claims appears: approve or reject everyone’s claims',
    create: 'HR → Claims appears: add claims for anyone',
    edit: 'HR → Claims appears: add and change claims for anyone',
    delete: 'Remove claims',
  },
  finance: {
    view: 'The Finance menu appears, to look only',
    create: 'Add and change invoices, bills, payments, bank lines, journals and accounts',
    edit: 'Add, change and remove everything in Finance',
    delete: 'Remove invoices, bills, payments, bank lines, journals and accounts',
  },
  inventory: {
    view: 'The Catalog menu appears, to look only',
    create: 'Add and change items and stock adjustments',
    edit: 'Add, change and remove items and stock adjustments',
    delete: 'Remove items and stock adjustments',
  },
  crm: {
    view: 'The CRM menu appears, to look only',
    create: 'Add and change customers and suppliers',
    edit: 'Add, change and remove customers and suppliers',
    delete: 'Remove customers and suppliers',
  },
};

/** Sections a company can switch off in Settings → Modules (hidden for everyone when off). Company, Users and Settings are always on: they are where the switches live. */
export const SWITCHABLE_MODULES = ['employees', 'leave', 'attendance', 'claims', 'payroll', 'finance', 'inventory', 'crm', 'projects', 'workflow'];
