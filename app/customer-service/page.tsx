import { Headphones, Clock } from 'lucide-react';

export default function CustomerServicePage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 max-w-md w-full">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
          style={{ background: 'var(--brand-cyan-light)' }}
        >
          <Headphones className="w-7 h-7" style={{ color: 'var(--brand-navy)' }} />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Customer Service</h1>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          This section is under development. It will give the customer service team a
          dedicated view of client data, tickets, and communication history.
        </p>
        <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
          <Clock className="w-3.5 h-3.5" />
          Coming soon
        </div>
      </div>
    </div>
  );
}
