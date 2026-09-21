import React, { useState, useEffect } from 'react';

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface Tenant {
  id: string;
  name: string;
}

interface UsageData {
  tenantId: string;
  period: string;
  apiCalls: { used: number; limit: number };
  aiTokens: { used: number; limit: number };
  cost: { amount: number; formattedINR: string; currency: string };
  plan: 'Free' | 'Pro';
  subscriptionStatus: string;
}

export default function App() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [simulatorType, setSimulatorType] = useState<'api_call' | 'ai_tokens'>('api_call');
  const [quantity, setQuantity] = useState<number>(1);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(`key_${Date.now()}`);
  const [inputTokens, setInputTokens] = useState<number>(1000);
  const [cachedInputTokens, setCachedInputTokens] = useState<number>(500);
  const [outputTokens, setOutputTokens] = useState<number>(300);
  const [reasoningTokens, setReasoningTokens] = useState<number>(100);
  const [lastResponse, setLastResponse] = useState<any>(null);
  const [paymentSuccess, setPaymentSuccess] = useState<string>('');
  const [paymentError, setPaymentError] = useState<string>('');
  const [isProcessingPayment, setIsProcessingPayment] = useState<boolean>(false);

  const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
  const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_Tedpk5ARFyZh2i';

  useEffect(() => {
    fetchTenants();
  }, []);

  useEffect(() => {
    if (selectedTenantId) {
      fetchUsage(selectedTenantId);
      setPaymentSuccess('');
      setPaymentError('');
    }
  }, [selectedTenantId]);

  const fetchTenants = async () => {
    try {
      const res = await fetch(`${API_BASE}/tenants`);
      const data = await res.json();
      if (data.tenants && data.tenants.length > 0) {
        setTenants(data.tenants);
        setSelectedTenantId(data.tenants[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch tenants:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsage = async (tenantId: string) => {
    try {
      const res = await fetch(`${API_BASE}/usage?tenantId=${tenantId}`);
      const data = await res.json();
      setUsage(data);
    } catch (err) {
      console.error('Failed to fetch usage:', err);
    }
  };

  const handleSimulateRequest = async () => {
    if (!selectedTenantId) return;

    const body: any = {
      tenantId: selectedTenantId,
      usageType: simulatorType,
      quantity: Number(quantity),
    };

    if (simulatorType === 'ai_tokens') {
      body.tokenBreakdown = {
        inputTokens: Number(inputTokens),
        cachedInputTokens: Number(cachedInputTokens),
        outputTokens: Number(outputTokens),
        reasoningTokens: Number(reasoningTokens),
      };
      body.quantity = Number(inputTokens) + Number(cachedInputTokens) + Number(outputTokens) + Number(reasoningTokens);
    }

    try {
      const res = await fetch(`${API_BASE}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(body),
      });

      const responseData = await res.json();
      setLastResponse({
        status: res.status,
        ok: res.ok,
        data: responseData,
      });

      fetchUsage(selectedTenantId);
    } catch (err: any) {
      setLastResponse({
        status: 500,
        ok: false,
        data: { error: { message: err.message } },
      });
    }
  };

  /**
   * STEP 2: FRONTEND - Razorpay Standard Checkout Integration
   */
  const handleRazorpayStandardCheckout = async () => {
    if (!selectedTenantId) return;
    setPaymentSuccess('');
    setPaymentError('');
    setIsProcessingPayment(true);

    try {
      // 1. Call Backend Step 1: Create Order Endpoint
      const orderRes = await fetch(`${API_BASE}/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 49900, // ₹499 in paise (minimum 100 paise)
          currency: 'INR',
          receipt: `rcpt_pro_${Date.now()}`,
          notes: { tenant_id: selectedTenantId },
        }),
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok || !orderData.order_id) {
        throw new Error(orderData.error?.message || 'Failed to create Razorpay checkout order');
      }

      // Check if Razorpay SDK script is loaded
      if (typeof window.Razorpay === 'undefined') {
        throw new Error('Razorpay Checkout SDK not loaded. Verify internet connection.');
      }

      // 2. Open Razorpay Checkout Modal
      const options = {
        key: RAZORPAY_KEY_ID,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'MeterForge',
        description: 'Pro Subscription Upgrade (10k API Calls / 1M AI Tokens)',
        order_id: orderData.order_id,
        handler: async function (response: any) {
          try {
            // Step 3: Send razorpay_payment_id, razorpay_order_id, razorpay_signature to Backend Verify Endpoint
            const verifyRes = await fetch(`${API_BASE}/verify-payment`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                tenantId: selectedTenantId,
              }),
            });

            const verifyData = await verifyRes.json();
            if (verifyRes.ok && verifyData.success) {
              setPaymentSuccess('🎉 Payment Verified Successfully! Tenant upgraded to Pro Plan.');
              fetchUsage(selectedTenantId);
            } else {
              setPaymentError(verifyData.error?.message || 'Payment signature verification failed.');
            }
          } catch (err: any) {
            setPaymentError(`Verification error: ${err.message}`);
          } finally {
            setIsProcessingPayment(false);
          }
        },
        notes: { tenant_id: selectedTenantId },
        theme: { color: '#6366f1' },
      };

      if (orderData.isFallback || orderData.order_id.startsWith('order_demo_')) {
        try {
          const verifyRes = await fetch(`${API_BASE}/verify-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: orderData.order_id,
              razorpay_payment_id: `pay_demo_${Date.now()}`,
              razorpay_signature: `sig_demo_${Date.now()}`,
              tenantId: selectedTenantId,
            }),
          });

          const verifyData = await verifyRes.json();
          if (verifyRes.ok && verifyData.success) {
            setPaymentSuccess('🎉 Demo Payment Verified Successfully! Tenant upgraded to Pro Plan.');
            fetchUsage(selectedTenantId);
          } else {
            setPaymentError(verifyData.error?.message || 'Payment signature verification failed.');
          }
        } catch (err: any) {
          setPaymentError(`Verification error: ${err.message}`);
        } finally {
          setIsProcessingPayment(false);
        }
        return;
      }

      const razorpayInstance = new window.Razorpay(options);
      razorpayInstance.on('payment.failed', function (response: any) {
        setIsProcessingPayment(false);
        setPaymentError(`Payment Failed: ${response.error?.description || response.error?.reason || 'Payment rejected'}`);
      });

      razorpayInstance.open();
    } catch (err: any) {
      setIsProcessingPayment(false);
      setPaymentError(err.message || 'Razorpay checkout error');
    }
  };

  const generateNewKey = () => {
    setIdempotencyKey(`key_${Date.now()}`);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400">
              MeterForge
            </h1>
            <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800">
              FlyRank Capstone
            </span>
            <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
              Razorpay Standard Checkout
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Usage Metering & Billing Engine with Verified Razorpay Checkout
          </p>
        </div>

        {/* Tenant Selector */}
        <div className="flex items-center gap-3 bg-slate-900 p-2 rounded-xl border border-slate-800">
          <span className="text-xs font-medium text-slate-400 pl-2">Active Tenant:</span>
          <select
            value={selectedTenantId}
            onChange={(e) => setSelectedTenantId(e.target.value)}
            className="bg-slate-950 text-slate-200 text-sm font-medium py-1.5 px-3 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Payment Success/Error Banners */}
      {paymentSuccess && (
        <div className="mt-6 p-4 rounded-xl bg-emerald-950/70 border border-emerald-800 text-emerald-200 text-sm flex items-center justify-between shadow-lg">
          <span>{paymentSuccess}</span>
          <button
            onClick={() => setPaymentSuccess('')}
            className="text-xs font-bold text-emerald-400 hover:text-emerald-200 pl-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {paymentError && (
        <div className="mt-6 p-4 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-sm flex items-center justify-between shadow-lg">
          <span>⚠️ {paymentError}</span>
          <button
            onClick={() => setPaymentError('')}
            className="text-xs font-bold text-rose-400 hover:text-rose-200 pl-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Dashboard Grid */}
      {loading ? (
        <div className="py-20 text-center text-slate-500">Loading MeterForge Engine...</div>
      ) : usage ? (
        <main className="mt-8 space-y-8">
          {/* Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Plan Badge Card */}
            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Current Plan
                </span>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-3xl font-extrabold text-white">{usage.plan}</span>
                  <span
                    className={`text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider ${
                      usage.plan === 'Pro'
                        ? 'bg-purple-950 text-purple-300 border border-purple-800'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {usage.subscriptionStatus}
                  </span>
                </div>
              </div>

              {usage.plan === 'Free' ? (
                <button
                  onClick={handleRazorpayStandardCheckout}
                  disabled={isProcessingPayment}
                  className="mt-6 w-full py-2.5 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-indigo-950/50 disabled:opacity-50"
                >
                  {isProcessingPayment ? 'Opening Razorpay Modal...' : 'Pay & Upgrade to Pro (₹499)'}
                </button>
              ) : (
                <div className="mt-6 text-xs text-emerald-400 font-medium flex items-center gap-1.5">
                  ✓ High Quota Limits Active (10,000 API Calls / 1M Tokens)
                </div>
              )}
            </div>

            {/* API Calls Usage */}
            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  API Calls (Monthly)
                </span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-2xl font-bold text-white">
                    {usage.apiCalls.used.toLocaleString()}
                  </span>
                  <span className="text-sm font-medium text-slate-400">
                    / {usage.apiCalls.limit.toLocaleString()} calls
                  </span>
                </div>
              </div>

              <div className="mt-6">
                <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className={`h-full transition-all duration-500 ${
                      usage.apiCalls.used >= usage.apiCalls.limit
                        ? 'bg-rose-500'
                        : usage.apiCalls.used > usage.apiCalls.limit * 0.8
                        ? 'bg-amber-500'
                        : 'bg-indigo-500'
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        (usage.apiCalls.used / usage.apiCalls.limit) * 100
                      )}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-500 mt-1.5">
                  <span>Quota usage</span>
                  <span>
                    {((usage.apiCalls.used / usage.apiCalls.limit) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            {/* AI Tokens Usage */}
            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  AI Tokens (Monthly)
                </span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-2xl font-bold text-white">
                    {usage.aiTokens.used.toLocaleString()}
                  </span>
                  <span className="text-sm font-medium text-slate-400">
                    / {usage.aiTokens.limit.toLocaleString()} tokens
                  </span>
                </div>
              </div>

              <div className="mt-6">
                <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className={`h-full transition-all duration-500 ${
                      usage.aiTokens.used >= usage.aiTokens.limit
                        ? 'bg-rose-500'
                        : usage.aiTokens.used > usage.aiTokens.limit * 0.8
                        ? 'bg-amber-500'
                        : 'bg-cyan-500'
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        (usage.aiTokens.used / usage.aiTokens.limit) * 100
                      )}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-500 mt-1.5">
                  <span>
                    Cost: <strong className="text-slate-200">{usage.cost.formattedINR}</strong>
                  </span>
                  <span>
                    {((usage.aiTokens.used / usage.aiTokens.limit) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Metering Simulator */}
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
            <h2 className="text-lg font-bold text-white mb-1">Interactive Request Simulator</h2>
            <p className="text-xs text-slate-400 mb-6">
              Test exact-once idempotency deduplication and real-time quota boundary enforcement
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Usage Type
                  </label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setSimulatorType('api_call')}
                      className={`flex-1 py-2 px-4 rounded-xl text-sm font-semibold border transition-all ${
                        simulatorType === 'api_call'
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      API Call
                    </button>
                    <button
                      type="button"
                      onClick={() => setSimulatorType('ai_tokens')}
                      className={`flex-1 py-2 px-4 rounded-xl text-sm font-semibold border transition-all ${
                        simulatorType === 'ai_tokens'
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      AI Tokens
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Idempotency-Key Header
                    </label>
                    <button
                      type="button"
                      onClick={generateNewKey}
                      className="text-xs text-indigo-400 hover:underline font-medium"
                    >
                      Generate New Key
                    </button>
                  </div>
                  <input
                    type="text"
                    value={idempotencyKey}
                    onChange={(e) => setIdempotencyKey(e.target.value)}
                    className="w-full bg-slate-950 text-slate-200 text-sm font-mono py-2 px-3 rounded-xl border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {simulatorType === 'api_call' ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Quantity (API Calls)
                    </label>
                    <input
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full bg-slate-950 text-slate-200 text-sm font-mono py-2 px-3 rounded-xl border border-slate-800"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Input Tokens (₹0.15/1k)
                      </label>
                      <input
                        type="number"
                        value={inputTokens}
                        onChange={(e) => setInputTokens(Number(e.target.value))}
                        className="w-full bg-slate-950 text-slate-200 text-xs font-mono py-2 px-2.5 rounded-lg border border-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Cached Input (75% discount)
                      </label>
                      <input
                        type="number"
                        value={cachedInputTokens}
                        onChange={(e) => setCachedInputTokens(Number(e.target.value))}
                        className="w-full bg-slate-950 text-slate-200 text-xs font-mono py-2 px-2.5 rounded-lg border border-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Output Tokens (₹0.60/1k)
                      </label>
                      <input
                        type="number"
                        value={outputTokens}
                        onChange={(e) => setOutputTokens(Number(e.target.value))}
                        className="w-full bg-slate-950 text-slate-200 text-xs font-mono py-2 px-2.5 rounded-lg border border-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Reasoning Tokens (Output rate)
                      </label>
                      <input
                        type="number"
                        value={reasoningTokens}
                        onChange={(e) => setReasoningTokens(Number(e.target.value))}
                        className="w-full bg-slate-950 text-slate-200 text-xs font-mono py-2 px-2.5 rounded-lg border border-slate-800"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSimulateRequest}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-indigo-950/50 mt-4"
                >
                  Send POST /generate Request
                </button>
              </div>

              {/* Response Preview */}
              <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Backend HTTP Response
                    </span>
                    {lastResponse && (
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                          lastResponse.status === 201
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : lastResponse.status === 200
                            ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                            : lastResponse.status === 429
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : 'bg-amber-950 text-amber-300 border border-amber-800'
                        }`}
                      >
                        HTTP {lastResponse.status}{' '}
                        {lastResponse.status === 201
                          ? 'Created'
                          : lastResponse.status === 200
                          ? 'OK (Duplicate)'
                          : lastResponse.status === 429
                          ? 'Quota Exceeded'
                          : 'Payment Required'}
                      </span>
                    )}
                  </div>

                  <pre className="mt-4 text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                    {lastResponse
                      ? JSON.stringify(lastResponse.data, null, 2)
                      : '// Click "Send POST /generate Request" to view live response'}
                  </pre>
                </div>

                {lastResponse?.data?.duplicate && (
                  <div className="mt-4 p-2.5 rounded-lg bg-cyan-950/50 border border-cyan-800 text-[11px] text-cyan-200">
                    ⚡ <strong>Idempotency Enforced:</strong> Duplicate idempotency key detected. Original result returned without creating duplicate usage event.
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      ) : (
        <div className="py-20 text-center text-slate-500">No tenant usage data found.</div>
      )}
    </div>
  );
}
