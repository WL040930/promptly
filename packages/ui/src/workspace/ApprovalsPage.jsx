import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../api/client.js';
import { getQuery } from '../utils/router.js';

export default function ApprovalsPage() {
    const queryClient = useQueryClient();
    const token = getQuery().get('token');
    const tokenQuery = useQuery({ queryKey: ['approval-token', token], enabled: Boolean(token), queryFn: () => apiRequest(`/api/continuations/approvals/token/${encodeURIComponent(token)}`) });
    const listQuery = useQuery({ queryKey: ['approvals'], enabled: !token, queryFn: () => apiRequest('/api/continuations/approvals') });
    const isPending = token ? tokenQuery.isPending : listQuery.isPending;
    const isError = token ? tokenQuery.isError : listQuery.isError;
    const approvals = token ? (tokenQuery.data ? [tokenQuery.data] : []) : (listQuery.data || []);
    const resolve = async (decision, id) => {
        if (token) await apiRequest(`/api/continuations/approvals/${encodeURIComponent(token)}/resolve`, { method: 'POST', body: JSON.stringify({ decision }) });
        else if (id) await apiRequest(`/api/continuations/approvals/id/${encodeURIComponent(id)}/resolve`, { method: 'POST', body: JSON.stringify({ decision }) });
        else return;
        queryClient.invalidateQueries({ queryKey: ['approvals'] });
        window.history.replaceState({}, '', '/app/approvals');
    };
    return (
        <div className="surface-grid min-h-full overflow-y-auto p-6 md:p-10">
            <div className="mx-auto w-full max-w-3xl">
                <p className="eyebrow">Workflow inbox</p>
                <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900">Approvals</h1>
                <p className="mt-2 text-sm text-slate-500">Review workflow requests assigned to you.</p>
                {isPending ? <div className="mt-8 rounded-2xl bg-white p-8 text-sm text-slate-500">Loading approvals…</div> : isError ? <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 p-8 text-sm text-rose-700">Unable to load this approval.</div> : approvals.length === 0 ? <div className="mt-8 rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Nothing is waiting for your decision.</div> : <div className="mt-8 space-y-4">{approvals.map(item => <article key={item.id} className="workspace-surface rounded-2xl p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-bold text-slate-900">{item.payload?.title || 'Review required'}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{item.payload?.instructions || 'Please review this workflow request.'}</p></div><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">Waiting</span></div><div className="mt-4 flex gap-2"><button type="button" onClick={() => resolve('approved', item.id)} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">Approve</button><button type="button" onClick={() => resolve('rejected', item.id)} className="rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-50">Reject</button></div></article>)}</div>}
            </div>
        </div>
    );
}
