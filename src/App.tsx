import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { FeedbackProvider } from './lib/feedback'
import { AuthGate } from './components/AuthGate'
import Layout from './components/Layout'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Calendar = lazy(() => import('./pages/Calendar'))
const Orders = lazy(() => import('./pages/Orders'))
const OrderForm = lazy(() => import('./pages/OrderForm'))
const OrderDetail = lazy(() => import('./pages/OrderDetail'))
const OrderPrint = lazy(() => import('./pages/OrderPrint'))
const Customers = lazy(() => import('./pages/Customers'))
const CustomerDetail = lazy(() => import('./pages/CustomerDetail'))
const StaffPage = lazy(() => import('./pages/Staff'))
const Parts = lazy(() => import('./pages/Parts'))
const Services = lazy(() => import('./pages/Services'))
const Prices = lazy(() => import('./pages/Prices'))
const Templates = lazy(() => import('./pages/Templates'))
const TemplateForm = lazy(() => import('./pages/TemplateForm'))
const Reports = lazy(() => import('./pages/Reports'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const Trash = lazy(() => import('./pages/Trash'))
const SharedOrder = lazy(() => import('./pages/SharedOrder'))
const NotFound = lazy(() => import('./pages/NotFound'))

function PageLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-slate-400">
      <Loader2 size={16} className="animate-spin" /> 正在加载…
    </div>
  )
}

export default function App() {
  return (
    <FeedbackProvider>
      <AuthGate>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="calendar" element={<Calendar />} />
              <Route path="orders" element={<Orders />} />
              <Route path="orders/new" element={<OrderForm />} />
              <Route path="orders/:id" element={<OrderDetail />} />
              <Route path="orders/:id/edit" element={<OrderForm />} />
              <Route path="customers" element={<Customers />} />
              <Route path="customers/:id" element={<CustomerDetail />} />
              <Route path="staff" element={<StaffPage />} />
              <Route path="parts" element={<Parts />} />
              <Route path="services" element={<Services />} />
              <Route path="prices" element={<Prices />} />
              <Route path="templates" element={<Templates />} />
              <Route path="templates/new" element={<TemplateForm />} />
              <Route path="templates/:id/edit" element={<TemplateForm />} />
              <Route path="reports" element={<Reports />} />
              <Route path="trash" element={<Trash />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route path="/orders/:id/print" element={<OrderPrint />} />
            <Route path="/share/:token" element={<SharedOrder />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </AuthGate>
    </FeedbackProvider>
  )
}
