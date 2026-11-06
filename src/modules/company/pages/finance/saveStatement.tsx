import { Modal, Checkbox, Button, Space } from 'antd';
import dayjs from 'dayjs';
import { companyFileService, statementPrefService, type DuplicateStatement } from '../../../../services/finance';

/** Ask which statement to keep when the month already has one. Resolves with the choice and whether to remember it. */
function ask(oldNames: string[], newName: string, month: string): Promise<{ choice: Exclude<DuplicateStatement, 'ask'>; remember: boolean }> {
  return new Promise(resolve => {
    let remember = false;
    const done = (choice: Exclude<DuplicateStatement, 'ask'>) => { inst.destroy(); resolve({ choice, remember }); };
    const inst = Modal.confirm({
      title: `There is already a statement for ${dayjs(`${month}-01`).format('MMMM YYYY')}`,
      icon: null,
      width: 520,
      content: (
        <div>
          <div style={{ margin: '8px 0' }}>Already saved: <b>{oldNames.join(', ')}</b></div>
          <div style={{ marginBottom: 12 }}>New: <b>{newName}</b></div>
          <Checkbox onChange={e => { remember = e.target.checked; }}>Don't ask again</Checkbox>
        </div>
      ),
      footer: (
        <Space wrap style={{ marginTop: 16, width: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={() => done('old')}>Keep the old one</Button>
          <Button onClick={() => done('both')}>Keep both</Button>
          <Button type="primary" onClick={() => done('new')}>Keep the new one</Button>
        </Space>
      ),
    });
  });
}

/**
 * Save a bank statement into Documents. One month should have one statement: if the bank already has one for
 * that month, the person chooses (or their remembered choice is used) to keep the new one, the old one, or both.
 * Returns what happened.
 */
export async function saveBankStatement(companyId: number, file: File, accountId: number, month: string): Promise<'saved' | 'replaced' | 'kept-old'> {
  const existing = (await companyFileService.list(companyId)).filter(f => f.folder === 'bank' && f.account_id === accountId && f.period === month);
  if (!existing.length) { await companyFileService.add(companyId, file, { folder: 'bank', account_id: accountId, period: month }); return 'saved'; }
  let choice = await statementPrefService.get(companyId);
  if (choice === 'ask') {
    const a = await ask(existing.map(f => f.file_name), file.name, month);
    choice = a.choice;
    if (a.remember) await statementPrefService.set(companyId, choice).catch(() => null);
  }
  if (choice === 'old') return 'kept-old';
  await companyFileService.add(companyId, file, { folder: 'bank', account_id: accountId, period: month });
  if (choice === 'new') { for (const f of existing) await companyFileService.remove(f); return 'replaced'; }
  return 'saved';
}
