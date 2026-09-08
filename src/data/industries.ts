export interface IndustryConfig {
  departments: string[];
  job_positions: string[];
  chart_of_accounts: string[];
  expense_categories: string[];
  inventory_categories: string[];
  payroll_components: { name: string; type: string }[];
  leave_types: { name: string; days: number }[];
  default_modules: string[];
  default_reports: string[];
}

export interface IndustryTemplate {
  id: number;
  category: string;
  industry: string;
  config: IndustryConfig;
}

const genConfig = (overrides: Partial<IndustryConfig>): IndustryConfig => ({
  departments: ['Management', 'Finance', 'HR', 'Operations', 'Admin'],
  job_positions: ['CEO', 'Manager', 'Executive', 'Coordinator', 'Assistant'],
  chart_of_accounts: ['Cash', 'Accounts Receivable', 'Accounts Payable', 'Sales Revenue', 'Operating Expenses', 'Retained Earnings'],
  expense_categories: ['Utilities', 'Office Supplies', 'Rent', 'Travel', 'Maintenance'],
  inventory_categories: ['Finished Goods', 'Supplies', 'Packaging'],
  payroll_components: [
    { name: 'Basic Salary', type: 'Earning' },
    { name: 'Allowance', type: 'Earning' },
    { name: 'Overtime', type: 'Earning' },
    { name: 'EPF/SOCSO', type: 'Deduction' },
    { name: 'Tax', type: 'Deduction' },
  ],
  leave_types: [
    { name: 'Annual Leave', days: 14 },
    { name: 'Sick Leave', days: 14 },
    { name: 'Hospitalization Leave', days: 60 },
    { name: 'Maternity Leave', days: 98 },
    { name: 'Paternity Leave', days: 7 },
    { name: 'Compassionate Leave', days: 3 },
  ],
  default_modules: ['employees', 'leave', 'claims'],
  default_reports: ['Profit & Loss', 'Balance Sheet', 'Employee List', 'Leave Summary'],
  ...overrides,
});

const CATEGORY_CONFIGS: Record<string, IndustryConfig> = {
  'General Business': genConfig({}),

  'Retail & Commerce': genConfig({
    departments: ['Management', 'Sales', 'Store Operations', 'E-commerce', 'Marketing', 'Finance', 'HR', 'Warehouse', 'Customer Service'],
    job_positions: ['CEO', 'Store Manager', 'Sales Associate', 'E-commerce Manager', 'Marketing Manager', 'Accountant', 'HR Manager', 'Warehouse Supervisor', 'Customer Service Lead'],
    chart_of_accounts: ['Cash', 'Accounts Receivable', 'Inventory - Retail', 'Store Fixtures', 'E-commerce Platform', 'Accounts Payable', 'Sales Revenue', 'Online Sales', 'Cost of Goods Sold', 'Operating Expenses', 'Shipping Costs'],
    expense_categories: ['Rent', 'Utilities', 'Marketing & Advertising', 'Shipping & Logistics', 'Packaging', 'Payment Processing', 'Store Maintenance', 'E-commerce Platform Fees', 'Inventory Write-off', 'Staff Welfare'],
    inventory_categories: ['Clothing & Apparel', 'Electronics', 'Home & Living', 'Beauty Products', 'Food & Beverage', 'Accessories', 'Seasonal Items', 'Gift Cards'],
    default_modules: ['employees', 'leave', 'claims', 'inventory', 'sales'],
    default_reports: ['Sales Report', 'Inventory Report', 'Profit & Loss', 'Customer List'],
  }),

  'Food & Beverage': genConfig({
    departments: ['Management', 'Kitchen', 'Service', 'Finance', 'HR', 'Purchasing', 'Marketing', 'Quality Control'],
    job_positions: ['CEO', 'Head Chef', 'Sous Chef', 'Kitchen Staff', 'Restaurant Manager', 'Server', 'Bartender', 'Accountant', 'HR Manager', 'Purchasing Manager', 'Marketing Manager', 'QA Officer'],
    chart_of_accounts: ['Cash', 'Accounts Receivable', 'Food Inventory', 'Beverage Inventory', 'Kitchen Equipment', 'Furniture & Fixtures', 'Accounts Payable', 'Sales Revenue - Dine-in', 'Sales Revenue - Takeaway', 'Cost of Goods Sold', 'Operating Expenses'],
    expense_categories: ['Raw Ingredients', 'Beverages', 'Packaging', 'Utilities', 'Rent', 'Kitchen Equipment Maintenance', 'Marketing', 'Delivery Commission', 'Staff Meals', 'Licenses & Permits'],
    inventory_categories: ['Meat & Poultry', 'Seafood', 'Vegetables & Fruits', 'Dairy & Eggs', 'Dry Goods', 'Beverages', 'Spices & Condiments', 'Packaging Supplies', 'Cleaning Supplies'],
    default_modules: ['employees', 'leave', 'attendance', 'claims', 'inventory', 'purchasing'],
    default_reports: ['Daily Sales', 'Inventory Usage', 'Labor Cost', 'Profit & Loss', 'Menu Performance'],
  }),

  'Construction & Property': genConfig({
    departments: ['Management', 'Projects', 'Engineering', 'Design', 'Finance', 'HR', 'Procurement', 'Safety', 'Legal'],
    job_positions: ['CEO', 'Project Manager', 'Site Engineer', 'Architect', 'Quantity Surveyor', 'Safety Officer', 'Accountant', 'HR Manager', 'Procurement Manager', 'Legal Counsel', 'Interior Designer'],
    chart_of_accounts: ['Cash', 'Accounts Receivable', 'Work in Progress', 'Equipment & Machinery', 'Vehicles', 'Accounts Payable', 'Contract Revenue', 'Service Revenue', 'Cost of Construction', 'Operating Expenses', 'Equipment Depreciation'],
    expense_categories: ['Raw Materials', 'Equipment Rental', 'Subcontractor Fees', 'Site Utilities', 'Safety Equipment', 'Permits & Licenses', 'Transportation', 'Accommodation', 'Professional Fees', 'Insurance'],
    inventory_categories: ['Construction Materials', 'Finishing Materials', 'Electrical Supplies', 'Plumbing Supplies', 'Safety Equipment', 'Tools & Hardware', 'Paint & Coatings'],
    default_modules: ['employees', 'leave', 'attendance', 'claims', 'payroll', 'projects'],
    default_reports: ['Project Progress', 'Budget vs Actual', 'Material Usage', 'Profit & Loss', 'Equipment Utilization'],
  }),

  Manufacturing: genConfig({
    departments: ['Management', 'Production', 'Quality Control', 'Supply Chain', 'Finance', 'HR', 'R&D', 'Warehouse', 'Maintenance'],
    job_positions: ['CEO', 'Production Manager', 'Quality Manager', 'Supply Chain Manager', 'Accountant', 'HR Manager', 'R&D Manager', 'Warehouse Supervisor', 'Maintenance Engineer'],
    chart_of_accounts: ['Cash', 'Accounts Receivable', 'Raw Materials Inventory', 'Work in Progress', 'Finished Goods', 'Machinery & Equipment', 'Accounts Payable', 'Sales Revenue', 'Cost of Goods Sold', 'Manufacturing Overhead', 'Operating Expenses'],
    expense_categories: ['Raw Materials', 'Utilities', 'Rent', 'Maintenance & Repairs', 'Equipment Depreciation', 'Quality Testing', 'Packaging', 'Logistics', 'Safety Equipment', 'R&D Expenses'],
    inventory_categories: ['Raw Materials', 'Work in Progress', 'Finished Goods', 'Packaging Materials', 'Spare Parts', 'Consumables', 'Semi-Finished Goods'],
    default_modules: ['employees', 'leave', 'attendance', 'claims', 'payroll', 'inventory', 'purchasing'],
    default_reports: ['Production Report', 'Inventory Report', 'Quality Control Report', 'Profit & Loss', 'Employee List'],
  }),

  Healthcare: genConfig({
    departments: ['Management', 'Medical', 'Nursing', 'Pharmacy', 'Finance', 'HR', 'Admin', 'Laboratory', 'Housekeeping'],
    job_positions: ['CEO', 'Medical Director', 'Doctor', 'Nurse', 'Pharmacist', 'Lab Technician', 'Accountant', 'HR Manager', 'Admin Manager', 'Receptionist'],
    chart_of_accounts: ['Cash', 'Accounts Receivable', 'Medical Equipment', 'Pharmacy Inventory', 'Furniture & Fixtures', 'Accounts Payable', 'Consultation Revenue', 'Pharmacy Revenue', 'Lab Revenue', 'Operating Expenses', 'Medical Supplies'],
    expense_categories: ['Medical Supplies', 'Pharmaceuticals', 'Equipment Maintenance', 'Utilities', 'Rent', 'Insurance', 'Lab Consumables', 'Staff Training', 'Licenses & Certifications', 'Cleaning & Sanitation'],
    inventory_categories: ['Pharmaceuticals', 'Medical Supplies', 'Lab Reagents', 'PPE', 'Surgical Instruments', 'Cleaning Supplies', 'Office Supplies'],
    default_modules: ['employees', 'leave', 'attendance', 'claims', 'payroll', 'crm'],
    default_reports: ['Patient Report', 'Revenue by Service', 'Inventory Usage', 'Profit & Loss', 'Appointment Summary'],
  }),

  Education: genConfig({
    departments: ['Management', 'Academic', 'Admin', 'Finance', 'HR', 'Marketing', 'Student Services', 'IT'],
    job_positions: ['CEO', 'Principal', 'Teacher', 'Administrator', 'Accountant', 'HR Manager', 'Marketing Manager', 'Student Counselor', 'IT Support', 'Cleaner'],
    chart_of_accounts: ['Cash', 'Accounts Receivable', 'School Equipment', 'Library Books', 'Building & Facilities', 'Accounts Payable', 'Tuition Revenue', 'Registration Fees', 'Grant Income', 'Operating Expenses'],
    expense_categories: ['Teaching Materials', 'Utilities', 'Rent', 'Maintenance', 'Staff Training', 'Marketing', 'Student Activities', 'Library Acquisitions', 'Insurance', 'IT Infrastructure'],
    inventory_categories: ['Books & Stationery', 'Teaching Aids', 'Sports Equipment', 'IT Equipment', 'Furniture', 'Cleaning Supplies'],
    default_modules: ['employees', 'leave', 'attendance', 'claims', 'payroll', 'crm'],
    default_reports: ['Student Enrollment', 'Fee Collection', 'Attendance Summary', 'Profit & Loss', 'Staff List'],
  }),

  Hospitality: genConfig({
    departments: ['Management', 'Front Office', 'Housekeeping', 'Food & Beverage', 'Sales & Marketing', 'Finance', 'HR', 'Maintenance'],
    job_positions: ['CEO', 'Hotel Manager', 'Front Desk Agent', 'Housekeeper', 'Chef', 'Sales Manager', 'Accountant', 'HR Manager', 'Maintenance Technician', 'Concierge'],
    chart_of_accounts: ['Cash', 'Accounts Receivable', 'Building & Facilities', 'Furniture & Fixtures', 'IT Equipment', 'Accounts Payable', 'Room Revenue', 'F&B Revenue', 'Event Revenue', 'Operating Expenses', 'Marketing Expenses'],
    expense_categories: ['Cleaning Supplies', 'Linens & Laundry', 'Utilities', 'Rent', 'Marketing', 'Booking Commission', 'Staff Uniforms', 'Maintenance', 'Insurance', 'Guest Amenities'],
    inventory_categories: ['Linens & Towels', 'Toiletries', 'Cleaning Supplies', 'F&B Stock', 'Maintenance Supplies', 'Office Supplies', 'Marketing Materials'],
    default_modules: ['employees', 'leave', 'attendance', 'claims', 'payroll', 'crm', 'sales'],
    default_reports: ['Occupancy Report', 'Revenue Per Room', 'Booking Summary', 'Profit & Loss', 'Staff Schedule'],
  }),

  Automotive: genConfig({
    departments: ['Management', 'Workshop', 'Sales', 'Parts & Inventory', 'Finance', 'HR', 'Customer Service'],
    job_positions: ['CEO', 'Workshop Manager', 'Mechanic', 'Service Advisor', 'Sales Executive', 'Parts Manager', 'Accountant', 'HR Manager', 'Customer Service Lead'],
    chart_of_accounts: ['Cash', 'Accounts Receivable', 'Parts Inventory', 'Vehicles Inventory', 'Workshop Equipment', 'Accounts Payable', 'Service Revenue', 'Parts Revenue', 'Vehicle Sales Revenue', 'Cost of Goods Sold', 'Operating Expenses'],
    expense_categories: ['Spare Parts', 'Tools & Equipment', 'Utilities', 'Rent', 'Marketing', 'Training', 'Waste Disposal', 'Insurance', 'Licenses', 'Software Subscriptions'],
    inventory_categories: ['Engine Parts', 'Electrical Parts', 'Body Parts', 'Tires & Wheels', 'Oils & Fluids', 'Accessories', 'Tools & Equipment'],
    default_modules: ['employees', 'leave', 'attendance', 'claims', 'payroll', 'inventory', 'sales'],
    default_reports: ['Service Report', 'Parts Usage', 'Sales Report', 'Customer History', 'Profit & Loss'],
  }),

  Technology: genConfig({
    departments: ['Management', 'Engineering', 'Product', 'Design', 'Sales', 'Marketing', 'Finance', 'HR', 'Customer Support', 'DevOps'],
    job_positions: ['CEO', 'CTO', 'Software Engineer', 'Product Manager', 'UI/UX Designer', 'Sales Executive', 'Marketing Manager', 'Accountant', 'HR Manager', 'Support Engineer', 'DevOps Engineer'],
    chart_of_accounts: ['Cash', 'Accounts Receivable', 'Software Licenses', 'Hardware & Equipment', 'Intellectual Property', 'Accounts Payable', 'Service Revenue', 'Subscription Revenue', 'Advertising Revenue', 'R&D Expenses', 'Operating Expenses'],
    expense_categories: ['Cloud Services', 'Software Licenses', 'Office Rent', 'Utilities', 'Travel', 'Training & Development', 'Marketing', 'Professional Fees', 'Hardware', 'Subscriptions', 'Team Events'],
    inventory_categories: ['Hardware Inventory', 'Software Licenses', 'Marketing Materials', 'Merchandise'],
    default_modules: ['employees', 'leave', 'attendance', 'claims', 'payroll', 'projects', 'crm'],
    default_reports: ['Project Status', 'Revenue Report', 'Employee Utilization', 'Profit & Loss', 'Sprint Report'],
  }),

  Logistics: genConfig({
    departments: ['Management', 'Warehouse', 'Transportation', 'Customer Service', 'Finance', 'HR', 'Operations', 'Safety'],
    job_positions: ['CEO', 'Warehouse Manager', 'Logistics Coordinator', 'Driver', 'Fleet Manager', 'Customer Service Lead', 'Accountant', 'HR Manager', 'Operations Manager', 'Safety Officer'],
    chart_of_accounts: ['Cash', 'Accounts Receivable', 'Warehouse Equipment', 'Vehicles & Fleet', 'Fuel Inventory', 'Accounts Payable', 'Freight Revenue', 'Warehousing Revenue', 'Fuel Expenses', 'Operating Expenses', 'Vehicle Maintenance'],
    expense_categories: ['Fuel', 'Vehicle Maintenance', 'Tires & Parts', 'Tolls & Permits', 'Insurance', 'Warehouse Rent', 'Utilities', 'Packaging', 'Staff Wages', 'Route Planning Software'],
    inventory_categories: ['Packaging Materials', 'Fuel & Lubricants', 'Warehouse Supplies', 'Safety Equipment', 'Office Supplies'],
    default_modules: ['employees', 'leave', 'attendance', 'claims', 'payroll', 'inventory'],
    default_reports: ['Delivery Report', 'Fleet Utilization', 'Fuel Consumption', 'Profit & Loss', 'Warehouse Stock'],
  }),

  'Beauty & Wellness': genConfig({
    departments: ['Management', 'Services', 'Sales', 'Finance', 'HR', 'Marketing', 'Admin'],
    job_positions: ['CEO', 'Salon Manager', 'Stylist', 'Beautician', 'Massage Therapist', 'Sales Associate', 'Accountant', 'HR Manager', 'Marketing Executive', 'Receptionist'],
    chart_of_accounts: ['Cash', 'Accounts Receivable', 'Salon Equipment', 'Product Inventory', 'Furniture & Fixtures', 'Accounts Payable', 'Service Revenue', 'Product Sales Revenue', 'Membership Revenue', 'Operating Expenses'],
    expense_categories: ['Beauty Products', 'Salon Supplies', 'Equipment Maintenance', 'Utilities', 'Rent', 'Marketing', 'Staff Training', 'Laundry', 'Licenses', 'Insurance'],
    inventory_categories: ['Hair Products', 'Skincare Products', 'Nail Products', 'Salon Tools', 'Towels & Linens', 'Retail Products', 'Cleaning Supplies'],
    default_modules: ['employees', 'leave', 'attendance', 'claims', 'payroll', 'crm', 'sales'],
    default_reports: ['Appointment Report', 'Service Revenue', 'Product Sales', 'Client List', 'Profit & Loss'],
  }),

  Finance: genConfig({
    departments: ['Management', 'Advisory', 'Compliance', 'Finance', 'HR', 'Marketing', 'Admin', 'IT'],
    job_positions: ['CEO', 'Managing Partner', 'Financial Advisor', 'Accountant', 'Auditor', 'Compliance Officer', 'HR Manager', 'Marketing Manager', 'Admin Manager', 'IT Support'],
    chart_of_accounts: ['Cash', 'Accounts Receivable', 'Office Equipment', 'Client Portfolios', 'Accounts Payable', 'Fee Revenue', 'Commission Revenue', 'Retainer Revenue', 'Operating Expenses', 'Professional Fees'],
    expense_categories: ['Office Rent', 'Utilities', 'Professional Development', 'Licenses & Certifications', 'Insurance', 'Marketing', 'Client Entertainment', 'Travel', 'Software Subscriptions', 'Legal Fees'],
    inventory_categories: ['Office Supplies', 'Marketing Materials', 'Client Files', 'Gifts & Promotional Items'],
    default_modules: ['employees', 'leave', 'attendance', 'claims', 'payroll', 'crm', 'projects'],
    default_reports: ['Client Portfolio', 'Revenue Report', 'Billable Hours', 'Profit & Loss', 'Compliance Report'],
  }),

  Others: genConfig({
    departments: ['Management', 'Finance', 'HR', 'Admin', 'Operations'],
    job_positions: ['CEO', 'Manager', 'Executive', 'Coordinator', 'Assistant', 'Accountant'],
    chart_of_accounts: ['Cash', 'Accounts Receivable', 'Accounts Payable', 'Revenue', 'Operating Expenses', 'Retained Earnings'],
    expense_categories: ['Utilities', 'Office Supplies', 'Rent', 'Travel', 'Maintenance', 'Program Expenses'],
    inventory_categories: ['Supplies', 'Materials', 'Equipment'],
    default_reports: ['Budget Report', 'Activity Report', 'Financial Statement', 'Donor/Funding Report'],
  }),
};

export const INDUSTRY_CATEGORIES: { category: string; industries: string[] }[] = [
  { category: 'General Business', industries: ['General Business', 'General Trading', 'Professional Services', 'Consulting', 'Holding Company'] },
  { category: 'Retail & Commerce', industries: ['Retail', 'Wholesale', 'E-commerce', 'Distribution'] },
  { category: 'Food & Beverage', industries: ['Restaurant', 'Caf\u00e9', 'Bakery', 'Catering', 'Food Manufacturing'] },
  { category: 'Construction & Property', industries: ['Construction', 'Engineering', 'Architecture', 'Interior Design', 'Property Development', 'Property Management'] },
  { category: 'Manufacturing', industries: ['Manufacturing', 'Assembly', 'Printing'] },
  { category: 'Healthcare', industries: ['Medical Clinic', 'Dental Clinic', 'Pharmacy', 'Laboratory', 'Veterinary Clinic'] },
  { category: 'Education', industries: ['School', 'Tuition Centre', 'Childcare', 'Training Provider'] },
  { category: 'Hospitality', industries: ['Hotel', 'Hostel', 'Travel Agency', 'Tourism'] },
  { category: 'Automotive', industries: ['Workshop', 'Car Dealer', 'Fleet Management'] },
  { category: 'Technology', industries: ['Software Company', 'IT Services', 'Digital Agency', 'Telecommunications'] },
  { category: 'Logistics', industries: ['Freight Forwarding', 'Warehousing', 'Courier', 'Transportation'] },
  { category: 'Beauty & Wellness', industries: ['Beauty Salon', 'Spa', 'Barber', 'Gym'] },
  { category: 'Finance', industries: ['Accounting Firm', 'Law Firm', 'Insurance Agency', 'Financial Advisory'] },
  { category: 'Others', industries: ['NGO', 'Religious Organisation', 'Government Agency'] },
];

let nextId = 1;

export const DEFAULT_INDUSTRIES: IndustryTemplate[] = INDUSTRY_CATEGORIES.flatMap(({ category, industries }) =>
  industries.map((industry) => ({
    id: nextId++,
    category,
    industry,
    config: CATEGORY_CONFIGS[category] || CATEGORY_CONFIGS.Others,
  }))
);
