import React, { useEffect, useRef, useState } from 'react';
import { Modal, Button, Spin, message } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { supabase } from '../utils/supabase';

interface Props {
  open: boolean;
  onClose: () => void;
  recordId: number;
}

export default function PayslipModal({ open, onClose, recordId }: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!open || !recordId) return;
    loadData();
  }, [open, recordId]);

  async function loadData() {
    setLoading(true);
    try {
      const { data: rec } = await supabase
        .from('payroll_records')
        .select('*, employees(full_name, employee_code, department)')
        .eq('id', recordId)
        .single();
      if (!rec) throw new Error('Record not found');
      const { data: company } = await supabase
        .from('companies')
        .select('name, logo_url, address, phone, email')
        .eq('id', rec.company_id)
        .single();
      setData({ ...rec, company });
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handlePrint() {
    const content = printRef.current;
    if (!content) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html>
      <head>
        <title>Payslip</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; color: #222; }
          .header { display: flex; align-items: center; gap: 16px; margin-bottom: 32px; }
          .header img { max-height: 60px; }
          .header h1 { margin: 0; font-size: 24px; }
          .section { margin-bottom: 24px; }
          .section h3 { font-size: 14px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 12px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #eee; font-size: 13px; }
          th { color: #666; font-weight: 600; }
          .total-row td { font-weight: bold; border-top: 2px solid #333; }
          .amount { text-align: right; }
          .row-data td:last-child { text-align: right; }
          .company-paid td { color: #999; }
          .company-paid td:last-child::after { content: ' (company)'; font-size: 11px; color: #999; }
          .net-pay { font-size: 20px; text-align: right; margin-top: 16px; }
          .net-pay span { color: #666; font-size: 14px; }
        </style>
        <style media="print">
          body { padding: 20px; }
          @page { margin: 15mm; }
        </style>
      </head>
      <body>${content.innerHTML}</body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  }

  if (!open) return null;

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={700} centered
      title={<span style={{ color: '#fff' }}>Payslip</span>}
      styles={{ content: { background: '#0b0f12', border: '1px solid rgba(120,200,255,0.18)' } }}>
      {loading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div> : data && (
        <div>
          <div ref={printRef}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              {data.company?.logo_url && (
                <img src={data.company.logo_url} alt="Logo" style={{ maxHeight: 50, maxWidth: 120 }} />
              )}
              <div>
                <div style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>{data.company?.name || 'Company'}</div>
                {data.company?.address && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{data.company.address}</div>}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase' }}>Employee</div>
                <div style={{ color: '#fff', fontSize: 16 }}>{data.employees?.full_name}</div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>{data.employees?.employee_code} &middot; {data.employees?.department}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase' }}>Pay Period</div>
                <div style={{ color: '#fff', fontSize: 14 }}>{data.pay_period_start} to {data.pay_period_end}</div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Pay Date: {data.pay_date}</div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 4, marginBottom: 8 }}>Earnings</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 }}>
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>Basic Pay</span>
                <span style={{ color: '#fff' }}>${(data.basic_pay || 0).toFixed(2)}</span>
              </div>
              {(data.allowances || 0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)' }}>Allowances</span>
                  <span style={{ color: '#fff' }}>${(data.allowances || 0).toFixed(2)}</span>
                </div>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 4, marginBottom: 8 }}>Deductions (Employee)</div>
              {(data.tax_deduction || 0) > 0 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 }}>
                  <span style={{ color: 'rgba(255,100,100,0.7)' }}>Statutory Deductions</span>
                  <span style={{ color: '#ff6b6b' }}>-${(data.tax_deduction || 0).toFixed(2)}</span>
                </div>
              ) : (
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>None</div>
              )}
              {(data.deductions || 0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 }}>
                  <span style={{ color: 'rgba(255,100,100,0.7)' }}>Other Deductions</span>
                  <span style={{ color: '#ff6b6b' }}>-${(data.deductions || 0).toFixed(2)}</span>
                </div>
              )}
            </div>

            {(data.company_paid_benefits || 0) > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 4, marginBottom: 8 }}>Company-Paid Contributions</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 }}>
                  <span style={{ color: 'rgba(100,200,150,0.7)' }}>Covered by Company</span>
                  <span style={{ color: '#4ecdc4' }}>${(data.company_paid_benefits || 0).toFixed(2)}</span>
                </div>
              </div>
            )}

            <div style={{ borderTop: '2px solid rgba(255,255,255,0.2)', paddingTop: 12, marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Net Pay</span>
                <span style={{ color: '#4ecdc4', fontSize: 22, fontWeight: 700 }}>${(data.net_pay || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <Button icon={<PrinterOutlined />} onClick={handlePrint}>Print / PDF</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
