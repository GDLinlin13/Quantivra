import { useEffect, useState, useCallback } from 'react';
import { Table, Button, Popconfirm, message, Empty, Typography, Space } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { paymentService, type Payment } from '../../../../services/finance';
import { money } from '../../../../data/documentLayouts';
import type { FinanceData } from './DocList';
import { useCompanyAccess } from '../../../../contexts/CompanyAccess';
import { fmtDate } from '../../../../utils/dateFormat';

const { Text } = Typography;

/** Money received (in) or paid out (out), and which documents each payment settled. */
export function PaymentsList({ data, direction }: { data: FinanceData; direction: 'in' | 'out' }) {
  const access = useCompanyAccess();
  const { companyId, contacts, accounts, docs, reload } = data;
  const [rows, setRows] = useState<Payment[]>([]);
  const [allocs, setAllocs] = useState<{ payment_id: number; document_id: number; amount: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, a] = await Promise.all([paymentService.list(companyId, direction), paymentService.allocations(companyId)]);
      setRows(p); setAllocs(a);
    } catch (e: any) { message.error(e.message); }
    setLoading(false);
  }, [companyId, direction]);
  useEffect(() => { load(); }, [load, docs]);

  const total = rows.reduce((s, p) => s + Number(p.amount), 0);
  return (
    <div>
      <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        {direction === 'in'
          ? 'Payments are recorded from an invoice: open Invoices and click “Receive”.'
          : 'Payments are recorded from a bill or expense: open Bills or Expenses and click “Pay”. Expenses paid on the spot are recorded automatically.'}
      </Text>
      <Table rowKey="id" size="small" loading={loading} dataSource={rows} pagination={{ pageSize: 50, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No payments yet" /> }}
        summary={() => rows.length ? (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={3}><b>Total</b></Table.Summary.Cell>
            <Table.Summary.Cell index={1} align="right"><b>{money(total, data.currency)}</b></Table.Summary.Cell>
            <Table.Summary.Cell index={2} colSpan={4} />
          </Table.Summary.Row>
        ) : null}
        columns={[
          { title: 'Date', dataIndex: 'payment_date', render: (v: string) => fmtDate(v) },
          { title: 'Number', dataIndex: 'number', render: (v: string | null) => v || '—' },
          { title: direction === 'in' ? 'From' : 'To', key: 'c', render: (_, p) => contacts.find(c => c.id === p.contact_id)?.name || '—' },
          { title: 'Amount', key: 'a', align: 'right' as const, render: (_, p) => money(p.amount, data.currency) },
          { title: 'How', dataIndex: 'method', render: (v: string | null) => v || '—' },
          { title: direction === 'in' ? 'Into' : 'From', key: 'acc', render: (_, p) => accounts.find(a => a.id === p.account_id)?.name || '—' },
          {
            title: 'For', key: 'f', render: (_, p) => (
              <Space size={4} wrap>
                {allocs.filter(a => a.payment_id === p.id).map(a => {
                  const d = docs.find(x => x.id === a.document_id);
                  return <Text key={a.document_id}>{d?.number || '?'} <Text type="secondary">({money(a.amount, data.currency)})</Text></Text>;
                })}
              </Space>
            ),
          },
          { title: 'Reference', dataIndex: 'reference', render: (v: string | null) => v || '—' },
          {
            title: '', key: 'x', width: 50, render: (_, p) => access.canRemove('finance') && (
              <Popconfirm title="Delete this payment?" description="The invoice / bill goes back to unpaid for this amount."
                onConfirm={async () => { try { await paymentService.remove(p.id); message.success('Deleted'); reload(); load(); } catch (e: any) { message.error(e.message); } }}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
        ]} />
    </div>
  );
}
