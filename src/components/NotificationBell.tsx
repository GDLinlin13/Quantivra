import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Dropdown, Typography } from 'antd';
import { BellOutlined, DollarOutlined, CalendarOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { workflowService, type FlowKind } from '../services/workflow';
import { claimService } from '../services/claims';
import { leaveService } from '../services/hr';
import { poService } from '../services/purchaseOrders';

const { Text } = Typography;

/**
 * The bell: for anyone who approves claims or leave, the requests waiting for them. The number goes down as each one
 * is approved or rejected, and the bell disappears for people who approve nothing.
 */
export function NotificationBell({ companyId }: { companyId: number }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [kinds, setKinds] = useState<FlowKind[]>([]);
  const [claims, setClaims] = useState(0);
  const [leave, setLeave] = useState(0);
  const [orders, setOrders] = useState(0);

  const load = useCallback(async () => {
    try {
      const k = await workflowService.approverKinds(companyId);
      setKinds(k);
      const waiting = async (kind: FlowKind, ids: number[]) => {
        if (!ids.length) return 0;
        const st = await workflowService.status(kind, ids);
        // before the workflow update the Approve tick decides, so everything pending is theirs
        return st.size ? ids.filter(id => st.get(id)?.can_act).length : ids.length;
      };
      if (k.includes('claim')) {
        const pending = (await claimService.list(companyId)).filter(c => c.status === 'pending');
        setClaims(await waiting('claim', pending.map(c => c.id)));
      } else setClaims(0);
      if (k.includes('leave')) {
        const pending = await leaveService.requests(companyId, { status: 'pending' });
        setLeave(await waiting('leave', pending.map(r => Number(r.id))));
      } else setLeave(0);
      // purchase orders waiting for their approval (database update 062)
      try {
        const pending = (await poService.list(companyId)).filter(o => o.status === 'pending');
        const st = await poService.status(pending.map(o => o.id));
        setOrders(pending.filter(o => st.get(o.id)?.can_act).length);
      } catch { setOrders(0); }
    } catch { /* the bell stays as it was */ }
  }, [companyId]);

  // when the page changes (an approval was just made), when the tab is looked at again, and every minute
  useEffect(() => { load(); }, [load, location.pathname, location.search]);
  useEffect(() => {
    const t = setInterval(load, 60_000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    window.addEventListener('qv-approvals-changed', onFocus);   // an approval was just made: count again
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); window.removeEventListener('qv-approvals-changed', onFocus); };
  }, [load]);

  if (!kinds.length && !orders) return null;
  const total = claims + leave + orders;
  const row = (icon: React.ReactNode, text: string, tab: string) => ({
    key: tab, icon, label: text, onClick: () => navigate(`/company/hr?tab=${tab}`),
  });
  const goOrders = () => { try { localStorage.setItem('qv-finance-area', 'purchases'); localStorage.setItem('qv-finance-purchases', 'orders'); } catch { /* ignore */ } navigate('/company/finance'); };
  const items = [
    ...(claims > 0 ? [row(<DollarOutlined />, `${claims} claim${claims === 1 ? '' : 's'} waiting for your approval`, 'claims')] : []),
    ...(leave > 0 ? [row(<CalendarOutlined />, `${leave} leave request${leave === 1 ? '' : 's'} waiting for your approval`, 'approvals')] : []),
    ...(orders > 0 ? [{ key: 'po', icon: <ShoppingCartOutlined />, label: `${orders} purchase order${orders === 1 ? '' : 's'} waiting for your approval`, onClick: goOrders }] : []),
    ...(total === 0 ? [{ key: 'none', disabled: true, label: <Text type="secondary">Nothing waiting for you</Text> }] : []),
  ];
  return (
    <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight">
      <Badge count={total} size="small" offset={[-4, 4]}>
        <Button type="text" icon={<BellOutlined />} style={{ color: '#f0ede6' }} aria-label="Notifications" />
      </Badge>
    </Dropdown>
  );
}
