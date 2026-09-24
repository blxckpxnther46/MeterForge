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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans antialiased selection:bg-zinc-800 selection:text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">
                MeterForge
              </h1>
              <span className="text-[11px] px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900 text-zinc-400 font-medium">
                FlyRank Capstone
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900 text-zinc-400 font-medium">
                Razorpay Test Mode
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Usage Metering & Billing Engine with Verified Razorpay Checkout
            </p>
          </div>

          {/* Tenant Selector */}
          <div className="flex items-center gap-2 bg-zinc-900 px-3 py-1.5 rounded-md border border-zinc-800">
            <span className="text-xs font-medium text-zinc-400">Active Tenant:</span>
            <select
              value={selectedTenantId}
              onChange={(e) => setSelectedTenantId(e.target.value)}
              className="bg-zinc-950 text-zinc-200 text-xs font-medium py-1 px-2.5 rounded border border-zinc-700 focus:outline-none focus:border-zinc-500 cursor-pointer"
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
          <div className="p-3.5 rounded-md bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-center justify-between">
            <span>{paymentSuccess}</span>
            <button
              onClick={() => setPaymentSuccess('')}
              className="text-xs font-medium text-zinc-400 hover:text-zinc-200 pl-4 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {paymentError && (
          <div className="p-3.5 rounded-md bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center justify-between">
            <span>⚠️ {paymentError}</span>
            <button
              onClick={() => setPaymentError('')}
              className="text-xs font-medium text-zinc-400 hover:text-zinc-200 pl-4 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main Dashboard Body */}
        {loading ? (
          <div className="py-20 text-center text-xs text-zinc-500 font-mono">Loading MeterForge Engine...</div>
        ) : usage ? (
          <main className="space-y-6">
            {/* Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Plan Card */}
              <div className="bg-zinc-900/60 p-5 rounded-lg border border-zinc-800 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                    Current Plan
                  </span>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-2xl font-bold text-zinc-100">{usage.plan}</span>
                    <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full font-medium border border-zinc-800 bg-zinc-950 text-zinc-300">
                      <span className={`w-1.5 h-1.5 rounded-full ${usage.plan === 'Pro' ? 'bg-indigo-400' : 'bg-emerald-400'}`}></span>
                      {usage.subscriptionStatus}
                    </span>
                  </div>
                </div>

                {usage.plan === 'Free' ? (
                  <button
                    onClick={handleRazorpayStandardCheckout}
                    disabled={isProcessingPayment}
                    className="mt-5 w-full py-2 px-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-medium rounded-md text-xs transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    {isProcessingPayment ? 'Opening Razorpay Modal...' : 'Pay & Upgrade to Pro (₹499)'}
                  </button>
                ) : (
                  <div className="mt-5 text-xs text-emerald-400 font-medium flex items-center gap-1.5">
                    ✓ High Quota Limits Active (10,000 API Calls / 1M Tokens)
                  </div>
                )}
              </div>

              {/* API Calls Usage Card */}
              <div className="bg-zinc-900/60 p-5 rounded-lg border border-zinc-800 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                    API Calls (Monthly)
                  </span>
                  <div className="flex items-baseline mt-2">
                    <span className="text-2xl font-bold text-zinc-100">
                      {usage.apiCalls.used.toLocaleString()}
                    </span>
                    <span className="text-xs text-zinc-400 ml-1.5">
                      / {usage.apiCalls.limit.toLocaleString()} calls
                    </span>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="w-full bg-zinc-950 h-1.5 rounded-full overflow-hidden border border-zinc-800/80">
                    <div
                      className={`h-full transition-all duration-300 ${
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
                  <div className="flex justify-between text-xs text-zinc-500 mt-2 font-mono">
                    <span>Quota usage</span>
                    <span>
                      {((usage.apiCalls.used / usage.apiCalls.limit) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* AI Tokens Usage Card */}
              <div className="bg-zinc-900/60 p-5 rounded-lg border border-zinc-800 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                    AI Tokens (Monthly)
                  </span>
                  <div className="flex items-baseline mt-2">
                    <span className="text-2xl font-bold text-zinc-100">
                      {usage.aiTokens.used.toLocaleString()}
                    </span>
                    <span className="text-xs text-zinc-400 ml-1.5">
                      / {usage.aiTokens.limit.toLocaleString()} tokens
                    </span>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="w-full bg-zinc-950 h-1.5 rounded-full overflow-hidden border border-zinc-800/80">
                    <div
                      className={`h-full transition-all duration-300 ${
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
                  <div className="flex justify-between text-xs text-zinc-500 mt-2 font-mono">
                    <span>
                      Cost: <strong className="text-zinc-300 font-normal">{usage.cost.formattedINR}</strong>
                    </span>
                    <span>
                      {((usage.aiTokens.used / usage.aiTokens.limit) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Metering Simulator Card */}
            <div className="bg-zinc-900/60 p-6 rounded-lg border border-zinc-800">
              <div className="mb-6 pb-4 border-b border-zinc-800/80">
                <h2 className="text-sm font-semibold text-zinc-100">Interactive Request Simulator</h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Test exact-once idempotency deduplication and real-time quota boundary enforcement
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Simulator Form Controls */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                      Usage Type
                    </label>
                    <div className="flex rounded-md bg-zinc-950 p-1 border border-zinc-800/80">
                      <button
                        type="button"
                        onClick={() => setSimulatorType('api_call')}
                        className={`flex-1 py-1.5 px-3 rounded text-xs font-medium transition-colors cursor-pointer ${
                          simulatorType === 'api_call'
                            ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        API Call
                      </button>
                      <button
                        type="button"
                        onClick={() => setSimulatorType('ai_tokens')}
                        className={`flex-1 py-1.5 px-3 rounded text-xs font-medium transition-colors cursor-pointer ${
                          simulatorType === 'ai_tokens'
                            ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        AI Tokens
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                        Idempotency-Key Header
                      </label>
                      <button
                        type="button"
                        onClick={generateNewKey}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 font-mono cursor-pointer"
                      >
                        Generate New Key
                      </button>
                    </div>
                    <input
                      type="text"
                      value={idempotencyKey}
                      onChange={(e) => setIdempotencyKey(e.target.value)}
                      className="w-full bg-zinc-950 text-zinc-200 text-xs font-mono py-2 px-3 rounded-md border border-zinc-800 focus:outline-none focus:border-zinc-700 focus:ring-1 focus:ring-zinc-700"
                    />
                  </div>

                  {simulatorType === 'api_call' ? (
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">
                        Quantity (API Calls)
                      </label>
                      <input
                        type="number"
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full bg-zinc-950 text-zinc-200 text-xs font-mono py-2 px-3 rounded-md border border-zinc-800 focus:outline-none focus:border-zinc-700"
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                          Input Tokens (₹0.15/1k)
                        </label>
                        <input
                          type="number"
                          value={inputTokens}
                          onChange={(e) => setInputTokens(Number(e.target.value))}
                          className="w-full bg-zinc-950 text-zinc-200 text-xs font-mono py-1.5 px-2.5 rounded-md border border-zinc-800 focus:outline-none focus:border-zinc-700"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                          Cached Input (75% discount)
                        </label>
                        <input
                          type="number"
                          value={cachedInputTokens}
                          onChange={(e) => setCachedInputTokens(Number(e.target.value))}
                          className="w-full bg-zinc-950 text-zinc-200 text-xs font-mono py-1.5 px-2.5 rounded-md border border-zinc-800 focus:outline-none focus:border-zinc-700"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                          Output Tokens (₹0.60/1k)
                        </label>
                        <input
                          type="number"
                          value={outputTokens}
                          onChange={(e) => setOutputTokens(Number(e.target.value))}
                          className="w-full bg-zinc-950 text-zinc-200 text-xs font-mono py-1.5 px-2.5 rounded-md border border-zinc-800 focus:outline-none focus:border-zinc-700"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                          Reasoning Tokens (Output rate)
                        </label>
                        <input
                          type="number"
                          value={reasoningTokens}
                          onChange={(e) => setReasoningTokens(Number(e.target.value))}
                          className="w-full bg-zinc-950 text-zinc-200 text-xs font-mono py-1.5 px-2.5 rounded-md border border-zinc-800 focus:outline-none focus:border-zinc-700"
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleSimulateRequest}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-md text-xs transition-colors shadow-sm mt-4 cursor-pointer"
                  >
                    Send POST /generate Request
                  </button>
                </div>

                {/* Developer Response Viewer */}
                <div className="bg-zinc-950 rounded-lg border border-zinc-800/80 p-4 flex flex-col justify-between font-mono">
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                      <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
                        Backend HTTP Response
                      </span>
                      {lastResponse && (
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded font-mono font-medium border ${
                            lastResponse.status === 201
                              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/80'
                              : lastResponse.status === 200
                              ? 'bg-cyan-950/60 text-cyan-400 border-cyan-800/80'
                              : lastResponse.status === 429
                              ? 'bg-rose-950/60 text-rose-400 border-rose-800/80'
                              : 'bg-amber-950/60 text-amber-400 border-amber-800/80'
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

                    <pre className="mt-3 text-xs font-mono text-zinc-300 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[280px] select-all">
                      {lastResponse
                        ? JSON.stringify(lastResponse.data, null, 2)
                        : '// Click "Send POST /generate Request" to view live response'}
                    </pre>
                  </div>

                  {lastResponse?.data?.duplicate && (
                    <div className="mt-3 p-2.5 rounded bg-cyan-950/30 border border-cyan-800/50 text-[11px] font-sans text-cyan-300 flex items-start gap-2">
                      <span>⚡</span>
                      <span>
                        <strong>Idempotency Enforced:</strong> Duplicate idempotency key detected. Original result returned without creating duplicate usage event.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </main>
        ) : (
          <div className="py-20 text-center text-xs text-zinc-500 font-mono">No tenant usage data found.</div>
        )}
      </div>
    </div>
  );
}
