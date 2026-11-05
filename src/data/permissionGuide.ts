// Plain-language guide shown on the Roles & Permissions screen.

export const MODULE_GUIDE: Record<string, { covers: string; built: boolean }> = {
  company:    { covers: 'Company profile, which modules are switched on, logo and branding (Settings, Company Profile).', built: true },
  employees:  { covers: 'Employee records, their documents and staff reports (HR → Employees).', built: true },
  leave:      { covers: 'Applying for, approving and reporting leave (HR → My Leave, Approvals, Leave Balances).', built: true },
  attendance: { covers: 'Clock-in / clock-out and time logs.', built: false },
  claims:     { covers: 'Expense claims: submitting, approving and paying them.', built: false },
  payroll:    { covers: 'Payroll runs, payslips and pay components (HR → Payroll). Salaries also need the role’s “Can see pay & manage users” switch.', built: true },
  finance:    { covers: 'Invoices, payments, banking and journals.', built: false },
  inventory:  { covers: 'Catalog: products and services, prices, stock on hand and stock adjustments.', built: true },
  crm:        { covers: 'Leads, customers and deals.', built: false },
  projects:   { covers: 'Projects, tasks, milestones and timesheets.', built: false },
  users:      { covers: 'Logins, roles and permissions. Changing them also needs “Can see pay & manage users”.', built: true },
  workflow:   { covers: 'Approval chains (who approves what, in which order).', built: false },
  settings:   { covers: 'Company settings: leave, payroll and approval rules, work week, holidays, document numbers.', built: true },
};

export const ACTION_GUIDE: Record<string, { means: string; example: string; usedNow: boolean }> = {
  view:    { means: 'See this section', example: 'e.g. Leave → view: the HR menu and My Leave appear', usedNow: true },
  create:  { means: 'Add new items', example: 'e.g. Leave → create: apply for leave', usedNow: false },
  edit:    { means: 'Change existing items', example: 'e.g. Employees → edit: the Employees, Leave Balances and Leave Types tabs appear', usedNow: true },
  delete:  { means: 'Remove items', example: 'e.g. delete an employee record', usedNow: false },
  approve: { means: 'Approve or reject other people’s requests', example: 'e.g. Leave → approve: the Approvals tab appears', usedNow: true },
  export:  { means: 'Download and report', example: 'e.g. Employees or Finance → export: the Reports menu appears', usedNow: true },
  print:   { means: 'Print documents', example: 'e.g. print payslips or forms', usedNow: false },
  void:    { means: 'Cancel something already issued', example: 'e.g. void an invoice', usedNow: false },
};
