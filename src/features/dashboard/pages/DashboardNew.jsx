import { useMemo, useEffect, useState, useCallback, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import {
    Card,
    Row,
    Col,
    Typography,
    Space,
    Button,
    Tag,
    List,
    Empty,
    Divider,
    Segmented,
    Modal,
    Spin,
    Collapse
} from "antd";
import {
    ArrowRightOutlined,
    CalendarOutlined,
    DollarCircleOutlined,
    ShoppingOutlined,
    TeamOutlined,
    ToolOutlined,
    StarOutlined,
    ClockCircleOutlined,
    AppstoreOutlined,
    LineChartOutlined,
    DownOutlined,
    UpOutlined
} from "@ant-design/icons";
import { useData } from "@/shared/hooks/useData";
import { useAuth } from "@/shared/hooks/useAuth";
import { useDashboardRealTime } from "@/shared/hooks/useRealTime";
import QuickActionCard from "../components/QuickActionCard";
import { useQuickActionConfig } from "../hooks/useQuickActionConfig";

// Lazy load modals for better performance
const StepBookingModal = lazy(() => import('@/features/bookings/components/components/StepBookingModal'));
const QuickRentalModal = lazy(() => import('../components/QuickRentalModal'));
const QuickCustomerModal = lazy(() => import('../components/QuickCustomerModal'));
const QuickAccommodationModal = lazy(() => import('../components/QuickAccommodationModal'));
const QuickShopSaleModal = lazy(() => import('../components/QuickShopSaleModal'));
const QuickMembershipModal = lazy(() => import('../components/QuickMembershipModal'));

// Import CalendarProvider for StepBookingModal context
import { CalendarProvider } from '@/features/bookings/components/contexts/CalendarContext';

const { Title, Text } = Typography;

// ============= UTILITY FUNCTIONS =============

const formatNumber = (value, decimals = 0) => {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        return (decimals > 0 ? Number(0).toFixed(decimals) : "0");
    }
    return num.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
};

const formatCurrency = (value, currency = "EUR") => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
        return `${currency} 0.00`;
    }
    try {
        return new Intl.NumberFormat(undefined, {
            style: "currency",
            currency,
            currencyDisplay: "code",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    } catch {
        return `${currency} ${amount.toFixed(2)}`;
    }
};

const formatHours = (value) => {
    const hours = Number(value);
    if (!Number.isFinite(hours)) {
        return "0h";
    }
    return `${formatNumber(hours, 1)}h`;
};

const mergeSummaryStats = (baseStats, summary) => {
    if (!summary) {
        return baseStats;
    }

    const merged = { ...baseStats };
    const lessonSummary = summary.lessons || {};
    const rentalSummary = summary.rentals || {};
    const revenueSummary = summary.revenue || {};
    const equipmentSummary = summary.equipment || {};

    if (typeof lessonSummary.total === "number") {
        merged.bookings = lessonSummary.total;
    }
    if (typeof lessonSummary.upcoming === "number") {
        merged.activeBookings = lessonSummary.upcoming;
    }
    if (typeof rentalSummary.active === "number") {
        merged.activeRentals = rentalSummary.active;
    }
    if (typeof equipmentSummary.total === "number") {
        merged.equipment = equipmentSummary.total;
    }
    if (typeof revenueSummary.income === "number") {
        merged.revenue = revenueSummary.income;
    }

    merged.lessonHours =
        typeof lessonSummary.totalHours === "number" ? lessonSummary.totalHours : merged.lessonHours;
    merged.lessonCompletionRate =
        typeof lessonSummary.completionRate === "number" ? lessonSummary.completionRate : merged.lessonCompletionRate;
    merged.rentalRevenue =
        typeof rentalSummary.totalRevenue === "number" ? rentalSummary.totalRevenue : merged.rentalRevenue;
    merged.netRevenue = typeof revenueSummary.net === "number" ? revenueSummary.net : merged.netRevenue;

    return merged;
};

const resolvePaymentKey = (payment) => {
    if (payment.id) return payment.id;
    if (payment.transaction_id) return payment.transaction_id;
    if (payment.reference_number) return payment.reference_number;

    const fallbackParts = [payment.user_id, payment.created_at].filter(Boolean);
    if (fallbackParts.length > 0) {
        return fallbackParts.join("-");
    }

    return `payment-${Math.random().toString(36).slice(2, 10)}`;
};

const resolvePaymentDirection = (direction) => {
    switch (direction) {
        case "income":
            return { directionClass: "text-emerald-600", sign: "+" };
        case "expense":
            return { directionClass: "text-rose-600", sign: "-" };
        default:
            return { directionClass: "text-slate-600", sign: "" };
    }
};

const getPaymentDisplay = (payment) => {
    const key = resolvePaymentKey(payment);
    const amountNumber = Math.abs(payment.amountNumber || 0);
    const paymentDateValue = payment.date ?? payment.transaction_date ?? payment.created_at;
    const formattedDate = paymentDateValue
        ? new Date(paymentDateValue).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric"
          })
        : "";

    const participantName =
        payment.student_name ?? payment.customer_name ?? payment.user_name ?? payment.userEmail ?? "";

    const description = payment.description ?? payment.reference_number ?? "Payment";
    const { directionClass, sign } = resolvePaymentDirection(payment.direction);
    const currency = payment.currency || "EUR";

    return {
        key,
        description,
        participantName,
        directionClass,
        sign,
        amountDisplay: amountNumber.toFixed(2),
        formattedDate,
        currency
    };
};

// ============= STYLE DEFINITIONS =============

const accentStyles = {
    blue: "bg-gradient-to-br from-blue-50 to-blue-100/50 text-blue-600 border-blue-200/50",
    emerald: "bg-gradient-to-br from-emerald-50 to-emerald-100/50 text-emerald-600 border-emerald-200/50",
    indigo: "bg-gradient-to-br from-indigo-50 to-indigo-100/50 text-indigo-600 border-indigo-200/50",
    orange: "bg-gradient-to-br from-amber-50 to-amber-100/50 text-amber-600 border-amber-200/50",
    violet: "bg-gradient-to-br from-violet-50 to-violet-100/50 text-violet-600 border-violet-200/50"
};

const iconBgStyles = {
    blue: "bg-blue-100/60 text-blue-600",
    emerald: "bg-emerald-100/60 text-emerald-600",
    indigo: "bg-indigo-100/60 text-indigo-600",
    orange: "bg-amber-100/60 text-amber-600",
    violet: "bg-violet-100/60 text-violet-600"
};

// ============= SUMMARY CARDS =============

const LessonSummaryCard = ({ summary = {}, timeframeLabel, generatedLabel }) => {
    const metrics = [
        { label: "Total lessons", value: formatNumber(summary.total), icon: "📚" },
        { label: "Completed", value: formatNumber(summary.completed), icon: "✓" },
        { label: "Upcoming", value: formatNumber(summary.upcoming), icon: "⏰" },
        { label: "Lesson hours", value: formatHours(summary.totalHours), icon: "⏱" },
        {
            label: "Completion",
            value: `${((Number(summary.completionRate) || 0) * 100).toFixed(1)}%`,
            icon: "📈"
        },
        { label: "Avg duration", value: formatHours(summary.averageDuration), icon: "⌛" }
    ];

    return (
        <Card
            title={
                <Space direction="vertical" size={4}>
                    <Space size={8}>
                        <LineChartOutlined style={{ color: '#3b82f6' }} />
                        <Text strong>Lesson overview</Text>
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>{timeframeLabel}</Text>
                </Space>
            }
            extra={
                generatedLabel ? (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                        Updated {generatedLabel}
                    </Text>
                ) : null
            }
            className="dashboard-card rounded-2xl border border-blue-200/30 shadow-sm bg-gradient-to-br from-blue-50/50 to-white"
            styles={{ body: { padding: 24 } }}
        >
            <Row gutter={[16, 16]}>
                {metrics.map((metric) => (
                    <Col span={12} key={metric.label}>
                        <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-blue-50/50 transition-colors">
                            <span style={{ fontSize: 18 }}>{metric.icon}</span>
                            <div className="flex flex-col gap-1">
                                <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>
                                    {metric.label}
                                </Text>
                                <Text strong style={{ fontSize: 18, color: '#3b82f6' }}>
                                    {metric.value}
                                </Text>
                            </div>
                        </div>
                    </Col>
                ))}
            </Row>
        </Card>
    );
};

const RentalSummaryCard = ({ summary = {} }) => {
    const metrics = [
        { label: "Total rentals", value: formatNumber(summary.total), icon: "🔧" },
        { label: "Active", value: formatNumber(summary.active), icon: "⚡" },
        { label: "Completed", value: formatNumber(summary.completed), icon: "✓" },
        { label: "Upcoming", value: formatNumber(summary.upcoming), icon: "⏰" }
    ];

    const revenueMetrics = [
        { label: "Total revenue", value: formatCurrency(summary.totalRevenue), icon: "💰" },
        { label: "Paid revenue", value: formatCurrency(summary.paidRevenue), icon: "✓💰" },
        { label: "Average per rental", value: formatCurrency(summary.averageRevenue), icon: "📊" }
    ];

    return (
        <Card 
            className="dashboard-card rounded-2xl border border-emerald-200/30 shadow-sm bg-gradient-to-br from-emerald-50/50 to-white" 
            styles={{ body: { padding: 24 } }}
        >
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Space size={8}>
                    <ToolOutlined style={{ color: '#10b981', fontSize: 18 }} />
                    <Text strong className="text-lg">Rental summary</Text>
                </Space>
                <Row gutter={[16, 16]}>
                    {metrics.map((metric) => (
                        <Col span={12} key={metric.label}>
                            <div className="flex items-start gap-2 p-2 rounded-lg hover:bg-emerald-50/50 transition-colors">
                                <span style={{ fontSize: 16 }}>{metric.icon}</span>
                                <div className="flex flex-col gap-1">
                                    <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>
                                        {metric.label}
                                    </Text>
                                    <Text strong style={{ fontSize: 16, color: '#10b981' }}>
                                        {metric.value}
                                    </Text>
                                </div>
                            </div>
                        </Col>
                    ))}
                </Row>
                <Divider style={{ margin: "8px 0" }} />
                <Space direction="vertical" size={10} style={{ width: "100%" }}>
                    {revenueMetrics.map((metric) => (
                        <div className="flex items-center justify-between p-2 rounded-lg hover:bg-emerald-50/50 transition-colors" key={metric.label}>
                            <div className="flex items-center gap-2">
                                <span style={{ fontSize: 14 }}>{metric.icon}</span>
                                <Text type="secondary" style={{ fontSize: 13 }}>{metric.label}</Text>
                            </div>
                            <Text strong style={{ color: '#10b981' }}>{metric.value}</Text>
                        </div>
                    ))}
                </Space>
            </Space>
        </Card>
    );
};

const FinancialSummaryCard = ({ summary = {} }) => {
    const netClass = (summary.net ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600";
    const netIcon = (summary.net ?? 0) >= 0 ? "📈" : "📉";
    const metrics = [
        { label: "Income", value: formatCurrency(summary.income), icon: "📥" },
        { label: "Expenses", value: formatCurrency(summary.expenses), icon: "📤" },
        { label: "Service revenue", value: formatCurrency(summary.serviceRevenue), icon: "🎓" },
        { label: "Rental revenue", value: formatCurrency(summary.rentalRevenue), icon: "🔧" },
        { label: "Transactions", value: formatNumber(summary.transactions), icon: "📊" }
    ];

    return (
        <Card 
            className="dashboard-card rounded-2xl border border-violet-200/30 shadow-sm bg-gradient-to-br from-violet-50/50 to-white" 
            styles={{ body: { padding: 24 } }}
        >
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Space size={8}>
                    <DollarCircleOutlined style={{ color: '#a855f7', fontSize: 18 }} />
                    <Text strong className="text-lg">Financial snapshot</Text>
                </Space>
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    {metrics.slice(0, 2).map((metric) => (
                        <div className="flex items-center justify-between p-2 rounded-lg hover:bg-violet-50/50 transition-colors" key={metric.label}>
                            <div className="flex items-center gap-2">
                                <span style={{ fontSize: 14 }}>{metric.icon}</span>
                                <Text type="secondary" style={{ fontSize: 13 }}>{metric.label}</Text>
                            </div>
                            <Text strong style={{ color: '#a855f7' }}>{metric.value}</Text>
                        </div>
                    ))}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-violet-100/40 to-transparent">
                        <div className="flex items-center gap-2">
                            <span style={{ fontSize: 16 }}>{netIcon}</span>
                            <Text type="secondary" style={{ fontSize: 13, fontWeight: 600 }}>Net</Text>
                        </div>
                        <span className={`text-base font-bold ${netClass}`}>
                            {formatCurrency(summary.net)}
                        </span>
                    </div>
                    {metrics.slice(2).map((metric) => (
                        <div className="flex items-center justify-between p-2 rounded-lg hover:bg-violet-50/50 transition-colors" key={metric.label}>
                            <div className="flex items-center gap-2">
                                <span style={{ fontSize: 14 }}>{metric.icon}</span>
                                <Text type="secondary" style={{ fontSize: 13 }}>{metric.label}</Text>
                            </div>
                            <Text strong style={{ color: '#a855f7' }}>{metric.value}</Text>
                        </div>
                    ))}
                </Space>
            </Space>
        </Card>
    );
};

const DashboardSummaryGrid = ({ summary, timeframeLabel, generatedLabel, canViewFinance }) => {
    if (!summary) {
        return null;
    }

    return (
        <Row gutter={[20, 20]}>
            <Col xs={24} lg={canViewFinance ? 8 : 12}>
                <LessonSummaryCard
                    summary={summary.lessons}
                    timeframeLabel={timeframeLabel}
                    generatedLabel={generatedLabel}
                />
            </Col>
            <Col xs={24} lg={canViewFinance ? 8 : 12}>
                <RentalSummaryCard summary={summary.rentals} />
            </Col>
            {canViewFinance && (
                <Col xs={24} lg={8}>
                    <FinancialSummaryCard summary={summary.revenue} />
                </Col>
            )}
        </Row>
    );
};

// ============= ANALYTICS DETAIL PANELS =============

const BookingsDetailPanel = ({ stats, upcomingBookings = [] }) => {
    const statusCounts = useMemo(() => {
        const counts = { scheduled: 0, confirmed: 0, completed: 0, cancelled: 0 };
        upcomingBookings.forEach(b => {
            const status = b.status?.toLowerCase() || 'scheduled';
            if (counts[status] !== undefined) counts[status]++;
        });
        return counts;
    }, [upcomingBookings]);

    return (
        <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100">
            <Row gutter={[16, 16]}>
                <Col xs={24} md={12}>
                    <div className="space-y-3">
                        <Text strong className="text-blue-700">Booking Status Breakdown</Text>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 bg-white rounded-lg shadow-sm">
                                <Text type="secondary" className="text-xs">Scheduled</Text>
                                <div className="text-xl font-bold text-blue-600">{statusCounts.scheduled}</div>
                            </div>
                            <div className="p-3 bg-white rounded-lg shadow-sm">
                                <Text type="secondary" className="text-xs">Confirmed</Text>
                                <div className="text-xl font-bold text-green-600">{statusCounts.confirmed}</div>
                            </div>
                            <div className="p-3 bg-white rounded-lg shadow-sm">
                                <Text type="secondary" className="text-xs">Completed</Text>
                                <div className="text-xl font-bold text-emerald-600">{statusCounts.completed}</div>
                            </div>
                            <div className="p-3 bg-white rounded-lg shadow-sm">
                                <Text type="secondary" className="text-xs">Cancelled</Text>
                                <div className="text-xl font-bold text-red-500">{statusCounts.cancelled}</div>
                            </div>
                        </div>
                    </div>
                </Col>
                <Col xs={24} md={12}>
                    <div className="space-y-3">
                        <Text strong className="text-blue-700">Quick Stats</Text>
                        <div className="space-y-2">
                            <div className="flex justify-between items-center p-2 bg-white rounded-lg">
                                <Text type="secondary">Active Bookings</Text>
                                <Tag color="blue">{formatNumber(stats.activeBookings)}</Tag>
                            </div>
                            <div className="flex justify-between items-center p-2 bg-white rounded-lg">
                                <Text type="secondary">Today's Lessons</Text>
                                <Tag color="cyan">{upcomingBookings.filter(b => {
                                    const today = new Date().toDateString();
                                    return new Date(b.start_time).toDateString() === today;
                                }).length}</Tag>
                            </div>
                            <div className="flex justify-between items-center p-2 bg-white rounded-lg">
                                <Text type="secondary">This Week</Text>
                                <Tag color="geekblue">{upcomingBookings.length}</Tag>
                            </div>
                        </div>
                    </div>
                </Col>
            </Row>
            <div className="mt-4 pt-4 border-t border-blue-100">
                <Link to="/bookings" className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-2">
                    View All Bookings <ArrowRightOutlined />
                </Link>
            </div>
        </div>
    );
};

const MembersDetailPanel = ({ stats }) => {
    const totalMembers = (stats.shopCustomers || 0) + (stats.schoolCustomers || 0) + (stats.instructors || 0);
    
    return (
        <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100">
            <Row gutter={[16, 16]}>
                <Col xs={24} md={8}>
                    <div className="p-4 bg-white rounded-xl shadow-sm text-center">
                        <ShoppingOutlined className="text-3xl text-blue-500 mb-2" />
                        <div className="text-2xl font-bold text-blue-600">{formatNumber(stats.shopCustomers)}</div>
                        <Text type="secondary">Shop Customers</Text>
                        <div className="mt-2">
                            <Tag color="blue">{totalMembers > 0 ? ((stats.shopCustomers / totalMembers) * 100).toFixed(0) : 0}%</Tag>
                        </div>
                    </div>
                </Col>
                <Col xs={24} md={8}>
                    <div className="p-4 bg-white rounded-xl shadow-sm text-center">
                        <TeamOutlined className="text-3xl text-cyan-500 mb-2" />
                        <div className="text-2xl font-bold text-cyan-600">{formatNumber(stats.schoolCustomers)}</div>
                        <Text type="secondary">School Students</Text>
                        <div className="mt-2">
                            <Tag color="cyan">{totalMembers > 0 ? ((stats.schoolCustomers / totalMembers) * 100).toFixed(0) : 0}%</Tag>
                        </div>
                    </div>
                </Col>
                <Col xs={24} md={8}>
                    <div className="p-4 bg-white rounded-xl shadow-sm text-center">
                        <StarOutlined className="text-3xl text-amber-500 mb-2" />
                        <div className="text-2xl font-bold text-amber-600">{formatNumber(stats.instructors)}</div>
                        <Text type="secondary">Instructors</Text>
                        <div className="mt-2">
                            <Tag color="gold">{totalMembers > 0 ? ((stats.instructors / totalMembers) * 100).toFixed(0) : 0}%</Tag>
                        </div>
                    </div>
                </Col>
            </Row>
            <div className="mt-4 pt-4 border-t border-emerald-100">
                <Link to="/customers" className="text-emerald-600 hover:text-emerald-800 font-medium flex items-center gap-2">
                    Manage Members <ArrowRightOutlined />
                </Link>
            </div>
        </div>
    );
};

const RentalsDetailPanel = ({ stats, summary = {} }) => {
    return (
        <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
            <Row gutter={[16, 16]}>
                <Col xs={24} md={12}>
                    <div className="space-y-3">
                        <Text strong className="text-indigo-700">Rental Status</Text>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 bg-white rounded-lg shadow-sm">
                                <Text type="secondary" className="text-xs">Active</Text>
                                <div className="text-xl font-bold text-indigo-600">{formatNumber(summary.active || stats.activeRentals)}</div>
                            </div>
                            <div className="p-3 bg-white rounded-lg shadow-sm">
                                <Text type="secondary" className="text-xs">Completed</Text>
                                <div className="text-xl font-bold text-green-600">{formatNumber(summary.completed)}</div>
                            </div>
                            <div className="p-3 bg-white rounded-lg shadow-sm">
                                <Text type="secondary" className="text-xs">Upcoming</Text>
                                <div className="text-xl font-bold text-cyan-600">{formatNumber(summary.upcoming)}</div>
                            </div>
                            <div className="p-3 bg-white rounded-lg shadow-sm">
                                <Text type="secondary" className="text-xs">Total</Text>
                                <div className="text-xl font-bold text-slate-600">{formatNumber(summary.total)}</div>
                            </div>
                        </div>
                    </div>
                </Col>
                <Col xs={24} md={12}>
                    <div className="space-y-3">
                        <Text strong className="text-indigo-700">Revenue</Text>
                        <div className="space-y-2">
                            <div className="flex justify-between items-center p-3 bg-white rounded-lg">
                                <Text type="secondary">Total Revenue</Text>
                                <Text strong className="text-indigo-600">{formatCurrency(summary.totalRevenue)}</Text>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-white rounded-lg">
                                <Text type="secondary">Paid Revenue</Text>
                                <Text strong className="text-green-600">{formatCurrency(summary.paidRevenue)}</Text>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-white rounded-lg">
                                <Text type="secondary">Avg per Rental</Text>
                                <Text strong>{formatCurrency(summary.averageRevenue)}</Text>
                            </div>
                        </div>
                    </div>
                </Col>
            </Row>
            <div className="mt-4 pt-4 border-t border-indigo-100">
                <Link to="/rentals" className="text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-2">
                    View All Rentals <ArrowRightOutlined />
                </Link>
            </div>
        </div>
    );
};

const EquipmentDetailPanel = ({ stats, equipment = [] }) => {
    const equipmentStats = useMemo(() => {
        const available = equipment.filter(e => e.status === 'available' || e.status === 'good').length;
        const inUse = equipment.filter(e => e.status === 'in_use' || e.status === 'rented').length;
        const maintenance = equipment.filter(e => e.status === 'maintenance' || e.status === 'repair').length;
        return { available, inUse, maintenance, total: equipment.length };
    }, [equipment]);

    return (
        <div className="p-4 bg-orange-50/50 rounded-xl border border-orange-100">
            <Row gutter={[16, 16]}>
                <Col xs={24} md={12}>
                    <div className="space-y-3">
                        <Text strong className="text-orange-700">Equipment Status</Text>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 bg-white rounded-lg shadow-sm">
                                <Text type="secondary" className="text-xs">Available</Text>
                                <div className="text-xl font-bold text-green-600">{equipmentStats.available}</div>
                            </div>
                            <div className="p-3 bg-white rounded-lg shadow-sm">
                                <Text type="secondary" className="text-xs">In Use</Text>
                                <div className="text-xl font-bold text-blue-600">{equipmentStats.inUse}</div>
                            </div>
                            <div className="p-3 bg-white rounded-lg shadow-sm">
                                <Text type="secondary" className="text-xs">Maintenance</Text>
                                <div className="text-xl font-bold text-orange-600">{equipmentStats.maintenance}</div>
                            </div>
                            <div className="p-3 bg-white rounded-lg shadow-sm">
                                <Text type="secondary" className="text-xs">Total Items</Text>
                                <div className="text-xl font-bold text-slate-600">{formatNumber(stats.equipment)}</div>
                            </div>
                        </div>
                    </div>
                </Col>
                <Col xs={24} md={12}>
                    <div className="space-y-3">
                        <Text strong className="text-orange-700">Availability</Text>
                        <div className="p-4 bg-white rounded-xl">
                            <div className="flex items-center justify-center">
                                <div className="relative w-32 h-32">
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="text-center">
                                            <div className="text-3xl font-bold text-orange-600">
                                                {stats.equipment > 0 ? ((equipmentStats.available / stats.equipment) * 100).toFixed(0) : 0}%
                                            </div>
                                            <Text type="secondary" className="text-xs">Available</Text>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </Col>
            </Row>
            <div className="mt-4 pt-4 border-t border-orange-100">
                <Link to="/equipment" className="text-orange-600 hover:text-orange-800 font-medium flex items-center gap-2">
                    Manage Equipment <ArrowRightOutlined />
                </Link>
            </div>
        </div>
    );
};

const RevenueDetailPanel = ({ stats, summary = {} }) => {
    const netClass = (summary.net ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600";
    
    return (
        <div className="p-4 bg-violet-50/50 rounded-xl border border-violet-100">
            <Row gutter={[16, 16]}>
                <Col xs={24} md={8}>
                    <div className="p-4 bg-white rounded-xl shadow-sm">
                        <Text type="secondary" className="text-xs block mb-1">Total Income</Text>
                        <div className="text-2xl font-bold text-green-600">{formatCurrency(summary.income)}</div>
                        <div className="mt-2">
                            <Tag color="green">📥 Revenue</Tag>
                        </div>
                    </div>
                </Col>
                <Col xs={24} md={8}>
                    <div className="p-4 bg-white rounded-xl shadow-sm">
                        <Text type="secondary" className="text-xs block mb-1">Total Expenses</Text>
                        <div className="text-2xl font-bold text-red-500">{formatCurrency(summary.expenses)}</div>
                        <div className="mt-2">
                            <Tag color="red">📤 Expenses</Tag>
                        </div>
                    </div>
                </Col>
                <Col xs={24} md={8}>
                    <div className="p-4 bg-gradient-to-br from-violet-100 to-white rounded-xl shadow-sm">
                        <Text type="secondary" className="text-xs block mb-1">Net Profit</Text>
                        <div className={`text-2xl font-bold ${netClass}`}>{formatCurrency(summary.net)}</div>
                        <div className="mt-2">
                            <Tag color={(summary.net ?? 0) >= 0 ? "green" : "red"}>
                                {(summary.net ?? 0) >= 0 ? "📈 Profit" : "📉 Loss"}
                            </Tag>
                        </div>
                    </div>
                </Col>
            </Row>
            <div className="mt-4">
                <Row gutter={[16, 16]}>
                    <Col xs={24} md={12}>
                        <div className="p-3 bg-white rounded-lg">
                            <div className="flex justify-between items-center">
                                <Text type="secondary">Service Revenue</Text>
                                <Text strong className="text-violet-600">{formatCurrency(summary.serviceRevenue)}</Text>
                            </div>
                        </div>
                    </Col>
                    <Col xs={24} md={12}>
                        <div className="p-3 bg-white rounded-lg">
                            <div className="flex justify-between items-center">
                                <Text type="secondary">Rental Revenue</Text>
                                <Text strong className="text-violet-600">{formatCurrency(summary.rentalRevenue)}</Text>
                            </div>
                        </div>
                    </Col>
                </Row>
            </div>
            <div className="mt-4 pt-4 border-t border-violet-100">
                <Link to="/finance" className="text-violet-600 hover:text-violet-800 font-medium flex items-center gap-2">
                    View Financial Details <ArrowRightOutlined />
                </Link>
            </div>
        </div>
    );
};

// ============= QUICK ACTIONS GRID =============

const QuickActionsGrid = ({ actions }) => {
    if (!actions || actions.length === 0) {
        return null;
    }

    return (
        <div className="mb-6">
            <div className="flex items-center gap-3 mb-4">
                <AppstoreOutlined className="text-xl text-slate-600" />
                <Text strong className="text-lg text-slate-700">Quick Actions</Text>
                <Tag bordered={false} color="blue" className="ml-2">
                    {actions.length} services
                </Tag>
            </div>
            <Row gutter={[16, 16]}>
                {actions.map((action, idx) => (
                    <Col key={action.id} xs={24} sm={12} md={8} lg={6}>
                        <div 
                            className="h-full animate-fade-in"
                            style={{ animationDelay: `${idx * 50}ms` }}
                        >
                            <QuickActionCard
                                title={action.title}
                                description={action.description}
                                icon={action.icon}
                                color={action.color}
                                primaryAction={action.primaryAction}
                                secondaryActions={action.secondaryActions}
                                stats={action.stats}
                            />
                        </div>
                    </Col>
                ))}
            </Row>
        </div>
    );
};

// ============= MAIN DASHBOARD COMPONENT =============

function Dashboard() {
    const { user } = useAuth();
    const {
        students: usersWithStudentRole,
        instructors,
        equipment,
        bookings,
        payments,
        rentals,
        dashboardSummary,
        refreshData
    } = useData();

    const dashboardUpdates = useDashboardRealTime();
    const [viewMode, setViewMode] = useState('actions');

    // Modal states for quick actions
    const [showBookingModal, setShowBookingModal] = useState(false);
    const [showRentalModal, setShowRentalModal] = useState(false);
    const [showCustomerModal, setShowCustomerModal] = useState(false);
    const [showAccommodationModal, setShowAccommodationModal] = useState(false);
    const [showShopSaleModal, setShowShopSaleModal] = useState(false);
    const [showMembershipModal, setShowMembershipModal] = useState(false);

    // Analytics panel expansion state - persisted in localStorage
    const ANALYTICS_PREFS_KEY = 'dashboard_analytics_expanded_panels';
    const [expandedPanels, setExpandedPanels] = useState(() => {
        try {
            const saved = localStorage.getItem(ANALYTICS_PREFS_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    // Save expanded panels preference to localStorage
    useEffect(() => {
        try {
            localStorage.setItem(ANALYTICS_PREFS_KEY, JSON.stringify(expandedPanels));
        } catch {
            // Ignore localStorage errors
        }
    }, [expandedPanels]);

    // Toggle panel expansion
    const togglePanel = useCallback((panelKey) => {
        setExpandedPanels(prev => 
            prev.includes(panelKey) 
                ? prev.filter(k => k !== panelKey)
                : [...prev, panelKey]
        );
    }, []);

    // Modal handlers - memoized to prevent unnecessary re-renders
    const modalHandlers = useMemo(() => ({
        newBooking: () => setShowBookingModal(true),
        newRental: () => setShowRentalModal(true),
        newCustomer: () => setShowCustomerModal(true),
        newAccommodation: () => setShowAccommodationModal(true),
        newShopSale: () => setShowShopSaleModal(true),
        newMembership: () => setShowMembershipModal(true),
    }), []);

    // Handle successful modal submissions
    const handleModalSuccess = useCallback(() => {
        refreshData();
    }, [refreshData]);

    // Helper to normalize permissions (can be object or array)
    const normalizePermissions = (perms) => {
        if (!perms) return [];
        if (Array.isArray(perms)) return perms;
        if (typeof perms === 'object') {
            return Object.entries(perms)
                .filter(([, value]) => value === true)
                .map(([key]) => key);
        }
        return [];
    };

    // Get user permissions for quick action filtering
    const userPermissions = useMemo(() => {
        if (!user) return [];
        // Try to get from user object or localStorage
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        const rawPerms = user.permissions || storedUser.permissions || [];
        return normalizePermissions(rawPerms);
    }, [user]);

    const quickActions = useQuickActionConfig(userPermissions, user?.role, modalHandlers);

    useEffect(() => {
        if (dashboardUpdates.refresh || dashboardUpdates.bookings || dashboardUpdates.stats) {
            refreshData();
        }
    }, [dashboardUpdates, refreshData]);

    const normalizedPayments = useMemo(() => {
        if (!Array.isArray(payments)) {
            return [];
        }

        return payments.map((payment) => {
            const rawType = String(payment?.type || "").toLowerCase();
            const amountNumber = Number(payment?.amount ?? payment?.amountNumber ?? 0);
            const isIncome =
                ["payment", "credit", "income", "deposit"].includes(rawType) ||
                (amountNumber > 0 && rawType === "service_payment");
            const isExpense =
                [
                    "charge",
                    "debit",
                    "refund",
                    "service_payment",
                    "rental_payment",
                    "package_purchase",
                    "expense"
                ].includes(rawType) || amountNumber < 0;
            const direction = isIncome ? "income" : isExpense ? "expense" : "neutral";

            return {
                ...payment,
                amountNumber,
                direction
            };
        });
    }, [payments]);

    const recentPayments = useMemo(() => normalizedPayments.slice(0, 5), [normalizedPayments]);

    const summaryTimeframeLabel = useMemo(() => {
        if (!dashboardSummary?.timeframe) {
            return "All time";
        }
        const { range, start, end } = dashboardSummary.timeframe;
        if (range === "custom") {
            const startLabel = start ? new Date(start).toLocaleDateString() : "";
            const endLabel = end ? new Date(end).toLocaleDateString() : "Today";
            return `${startLabel} - ${endLabel}`;
        }
        return "All time";
    }, [dashboardSummary]);

    const summaryGeneratedLabel = useMemo(() => {
        if (!dashboardSummary?.generatedAt) {
            return "";
        }
        try {
            return new Date(dashboardSummary.generatedAt).toLocaleString();
        } catch {
            return dashboardSummary.generatedAt;
        }
    }, [dashboardSummary]);

    const { upcomingBookings, stats } = useMemo(() => {
        const studentsList = Array.isArray(usersWithStudentRole) ? usersWithStudentRole : [];
        const bookingsList = Array.isArray(bookings) ? bookings : [];
        const rentalsList = Array.isArray(rentals) ? rentals : [];
        const instructorsList = Array.isArray(instructors) ? instructors : [];
        const equipmentList = Array.isArray(equipment) ? equipment : [];

        const shopCount = studentsList.filter(
            (student) => student.status === "shop" || student.status === "active"
        ).length;
        const schoolCount = studentsList.filter(
            (student) => student.status === "school" || student.status === "student"
        ).length;

        const now = new Date();
        const activeBookingsTotal = bookingsList.filter((booking) => {
            const bookingDate = new Date(booking.start_time);
            return bookingDate >= now;
        }).length;

        const activeRentalsTotal = rentalsList.filter((rental) => rental.status === "active").length;

        const threeDaysLater = new Date(now);
        threeDaysLater.setDate(now.getDate() + 3);

        const upcoming = bookingsList
            .filter((booking) => {
                const bookingDate = new Date(booking.start_time);
                return bookingDate >= now && bookingDate <= threeDaysLater;
            })
            .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
            .slice(0, 5);

        const revenue = normalizedPayments
            .filter((payment) => payment.direction === "income")
            .reduce((sum, payment) => sum + payment.amountNumber, 0);

        const baseStats = {
            users: studentsList.length,
            shopCustomers: shopCount,
            schoolCustomers: schoolCount,
            instructors: instructorsList.length,
            equipment: equipmentList.length,
            bookings: bookingsList.length,
            activeBookings: activeBookingsTotal,
            activeRentals: activeRentalsTotal,
            revenue
        };

        return {
            upcomingBookings: upcoming,
            stats: mergeSummaryStats(baseStats, dashboardSummary)
        };
    }, [usersWithStudentRole, bookings, rentals, instructors, equipment, normalizedPayments, dashboardSummary]);

    const canViewFinance = useMemo(() => {
        const financeRoles = ['admin', 'manager', 'developer'];
        return financeRoles.includes(user?.role) || userPermissions.includes('finances:read');
    }, [user?.role, userPermissions]);

    const canViewMembers = useMemo(() => {
        const memberRoles = ['instructor', 'admin', 'manager', 'developer'];
        return memberRoles.includes(user?.role) || userPermissions.includes('users:read');
    }, [user?.role, userPermissions]);

    const canViewRentals = useMemo(() => {
        const rentalRoles = ['admin', 'manager', 'developer'];
        return rentalRoles.includes(user?.role) || userPermissions.includes('equipment:rental');
    }, [user?.role, userPermissions]);

    // Hide welcome header for front desk role - they need quick actions only
    const showWelcomeHeader = useMemo(() => {
        return user?.role !== 'front_desk';
    }, [user?.role]);

    const highlightCards = useMemo(() => {
        const items = [
            {
                key: "bookings",
                title: "Active bookings",
                value: formatNumber(stats.activeBookings),
                icon: <CalendarOutlined style={{ fontSize: 20 }} />,
                link: "/bookings",
                accent: "blue"
            }
        ];

        if (canViewMembers) {
            items.push({
                key: "members",
                title: "Active members",
                value: formatNumber(stats.shopCustomers + stats.schoolCustomers + stats.instructors),
                icon: <TeamOutlined style={{ fontSize: 20 }} />,
                link: "/customers",
                accent: "emerald",
                meta: (
                    <Space size={8} wrap>
                        <Tag bordered={false} color="geekblue">
                            Shop {formatNumber(stats.shopCustomers)}
                        </Tag>
                        <Tag bordered={false} color="blue">
                            School {formatNumber(stats.schoolCustomers)}
                        </Tag>
                        <Tag bordered={false} color="gold">
                            Instructors {formatNumber(stats.instructors)}
                        </Tag>
                    </Space>
                )
            });
        }

        if (canViewRentals) {
            items.push({
                key: "rentals",
                title: "Active rentals",
                value: formatNumber(stats.activeRentals),
                icon: <ToolOutlined style={{ fontSize: 20 }} />,
                link: "/rentals",
                accent: "indigo"
            });
        }

        items.push({
            key: "equipment",
            title: "Equipment",
            value: formatNumber(stats.equipment),
            icon: <ShoppingOutlined style={{ fontSize: 20 }} />,
            link: "/equipment",
            accent: "orange"
        });

        if (canViewFinance) {
            items.push({
                key: "revenue",
                title: "Revenue (recent)",
                value: formatCurrency(stats.revenue),
                icon: <DollarCircleOutlined style={{ fontSize: 20 }} />,
                link: "/finance",
                accent: "violet"
            });
        }

        return items;
    }, [stats, canViewMembers, canViewRentals, canViewFinance]);

    const upcomingBookingItems = useMemo(() => {
        if (!Array.isArray(upcomingBookings)) {
            return [];
        }

        return upcomingBookings.map((booking) => {
            const date = new Date(booking.start_time);
            const dayLabel = date.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric"
            });
            const timeLabel = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

            return {
                key: booking.id,
                student: booking.student_name || "Pending assignment",
                service: booking.service_name || "Lesson",
                dayLabel,
                timeLabel,
                status: booking.status || "scheduled"
            };
        });
    }, [upcomingBookings]);

    const paymentItems = useMemo(() => {
        if (!Array.isArray(recentPayments) || recentPayments.length === 0) {
            return [];
        }
        return recentPayments.map(getPaymentDisplay);
    }, [recentPayments]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-white px-4 pb-20 pt-6">
            <style>{`
                @keyframes slideInDown {
                    from {
                        opacity: 0;
                        transform: translateY(-20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideInUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .animate-slide-in-down {
                    animation: slideInDown 0.6s ease-out;
                }
                .animate-fade-in {
                    animation: fadeIn 0.4s ease-out forwards;
                    opacity: 0;
                }
                .animate-slide-in-up {
                    animation: slideInUp 0.5s ease-out;
                }
                .dashboard-card {
                    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                    backdrop-filter: blur(10px);
                    -webkit-backdrop-filter: blur(10px);
                }
                .dashboard-card:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.08);
                }
                .highlight-card {
                    position: relative;
                    overflow: hidden;
                }
                .highlight-card::before {
                    content: '';
                    position: absolute;
                    top: -50%;
                    right: -50%;
                    width: 100%;
                    height: 100%;
                    background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
                    pointer-events: none;
                }
            `}</style>
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
                {/* Hero Header - hidden for front desk role */}
                {showWelcomeHeader && (
                <div className="animate-slide-in-down">
                    <Card
                        className="dashboard-card rounded-3xl border border-white/40 bg-gradient-to-br from-white/90 to-white/60 shadow-lg"
                        styles={{ body: { padding: "24px 32px" } }}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg">
                                    <StarOutlined className="text-2xl text-white" />
                                </div>
                                <div>
                                    <Title level={3} style={{ margin: 0, background: 'linear-gradient(135deg, #1e293b 0%, #3b82f6 100%)', backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                        Welcome back{user?.first_name ? `, ${user.first_name}` : ""}!
                                    </Title>
                                    <Text type="secondary" style={{ fontSize: 14 }}>
                                        What would you like to do today?
                                    </Text>
                                </div>
                            </div>
                            <Segmented
                                value={viewMode}
                                onChange={setViewMode}
                                options={[
                                    { label: 'Quick Actions', value: 'actions', icon: <AppstoreOutlined /> },
                                    { label: 'Analytics', value: 'analytics', icon: <LineChartOutlined /> }
                                ]}
                                size="large"
                                style={{ 
                                    background: 'rgba(0,0,0,0.03)',
                                    borderRadius: 12,
                                    padding: 4
                                }}
                            />
                        </div>
                    </Card>
                </div>
                )}

                {/* Quick Actions Mode */}
                {viewMode === 'actions' && (
                    <div className="animate-slide-in-up">
                        <QuickActionsGrid actions={quickActions} />
                        
                        {/* Activity Feed */}
                        <Row gutter={[16, 16]} className="mt-4">
                            <Col xs={24} lg={canViewFinance ? 12 : 24}>
                                <Card
                                    title={
                                        <Space size={8}>
                                            <ClockCircleOutlined style={{ color: '#3b82f6' }} />
                                            <Text strong>Upcoming bookings</Text>
                                        </Space>
                                    }
                                    extra={
                                        <Link to="/bookings">
                                            <Button type="text" icon={<ArrowRightOutlined />} style={{ fontSize: 12 }}>View all</Button>
                                        </Link>
                                    }
                                    className="dashboard-card rounded-2xl border border-slate-200/50 shadow-sm bg-white/80 backdrop-blur"
                                    styles={{ body: { padding: 0 } }}
                                >
                                    {upcomingBookingItems.length > 0 ? (
                                        <List
                                            dataSource={upcomingBookingItems}
                                            renderItem={(item, idx) => (
                                                <List.Item 
                                                    className="px-6 py-4 border-b border-slate-100/50 last:border-b-0 hover:bg-slate-50/50 transition-colors"
                                                    style={{ animationDelay: `${idx * 50}ms` }}
                                                >
                                                    <div className="flex w-full items-center justify-between">
                                                        <div className="flex items-center gap-3 flex-1">
                                                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100/60 text-blue-600">
                                                                <CalendarOutlined />
                                                            </div>
                                                            <div className="flex-1">
                                                                <Text strong style={{ fontSize: 14 }}>{item.student}</Text>
                                                                <div className="text-sm text-slate-500">{item.service}</div>
                                                            </div>
                                                        </div>
                                                        <Space size={6} wrap={false}>
                                                            <Tag bordered={false} color="blue" style={{ borderRadius: 6 }}>
                                                                {item.dayLabel}
                                                            </Tag>
                                                            <Tag bordered={false} color="geekblue" style={{ borderRadius: 6 }}>
                                                                {item.timeLabel}
                                                            </Tag>
                                                        </Space>
                                                    </div>
                                                </List.Item>
                                            )}
                                        />
                                    ) : (
                                        <div className="py-12 text-center">
                                            <ClockCircleOutlined style={{ fontSize: 36, color: '#cbd5e1', marginBottom: 12 }} />
                                            <Empty description="No upcoming bookings" />
                                        </div>
                                    )}
                                </Card>
                            </Col>
                            {canViewFinance && (
                                <Col xs={24} lg={12}>
                                    <Card
                                        title={
                                            <Space size={8}>
                                                <DollarCircleOutlined style={{ color: '#10b981' }} />
                                                <Text strong>Recent payments</Text>
                                            </Space>
                                        }
                                        extra={
                                            <Link to="/finance">
                                                <Button type="text" icon={<ArrowRightOutlined />} style={{ fontSize: 12 }}>View all</Button>
                                            </Link>
                                        }
                                        className="dashboard-card rounded-2xl border border-slate-200/50 shadow-sm bg-white/80 backdrop-blur"
                                        styles={{ body: { padding: 0 } }}
                                    >
                                        {paymentItems.length > 0 ? (
                                            <List
                                                dataSource={paymentItems}
                                                renderItem={(item, idx) => (
                                                    <List.Item 
                                                        className="px-6 py-4 border-b border-slate-100/50 last:border-b-0 hover:bg-slate-50/50 transition-colors"
                                                        style={{ animationDelay: `${idx * 50}ms` }}
                                                    >
                                                        <div className="flex w-full items-center justify-between">
                                                            <div className="flex items-center gap-3 flex-1">
                                                                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${item.direction === 'income' ? 'bg-emerald-100/60 text-emerald-600' : 'bg-rose-100/60 text-rose-600'}`}>
                                                                    {item.direction === 'income' ? '↓' : '↑'}
                                                                </div>
                                                                <div className="flex-1">
                                                                    <Text strong style={{ fontSize: 14 }}>{item.description}</Text>
                                                                    <div className="text-sm text-slate-500">{item.participantName}</div>
                                                                </div>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className={`text-base font-bold ${item.directionClass}`}>
                                                                    {item.sign}{formatCurrency(item.amountDisplay, item.currency)}
                                                                </div>
                                                                <div className="text-xs text-slate-500">{item.formattedDate}</div>
                                                            </div>
                                                        </div>
                                                    </List.Item>
                                                )}
                                            />
                                        ) : (
                                            <div className="py-12 text-center">
                                                <DollarCircleOutlined style={{ fontSize: 36, color: '#cbd5e1', marginBottom: 12 }} />
                                                <Empty description="No recent payments" />
                                            </div>
                                        )}
                                    </Card>
                                </Col>
                            )}
                        </Row>
                    </div>
                )}

                {/* Analytics Mode */}
                {viewMode === 'analytics' && (
                    <div className="animate-fade-in">
                        {/* KPI Cards Grid - Clickable for Details */}
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-4">
                                <Text type="secondary" className="text-sm">
                                    Click on cards to expand detailed information
                                </Text>
                                {expandedPanels.length > 0 && (
                                    <Button 
                                        type="link" 
                                        size="small"
                                        onClick={() => setExpandedPanels([])}
                                    >
                                        Collapse All
                                    </Button>
                                )}
                            </div>
                            <Row gutter={[16, 16]}>
                                {highlightCards.map((item, idx) => {
                                    const iconClass = iconBgStyles[item.accent] || iconBgStyles.blue;
                                    const isExpanded = expandedPanels.includes(item.key);
                                    return (
                                        <Col key={item.key} xs={24} sm={12} lg={6}>
                                            <Card
                                                hoverable
                                                className={`dashboard-card highlight-card h-full rounded-2xl border shadow-sm cursor-pointer ${isExpanded ? 'ring-2 ring-offset-2 ring-blue-400' : ''}`}
                                                styles={{ body: { padding: 20 } }}
                                                style={{
                                                    animationDelay: `${idx * 80}ms`
                                                }}
                                                onClick={() => togglePanel(item.key)}
                                            >
                                                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                                                    <div className="flex items-start justify-between">
                                                        <div>
                                                            <Text 
                                                                type="secondary" 
                                                                style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}
                                                            >
                                                                {item.title}
                                                            </Text>
                                                            <Title 
                                                                level={3} 
                                                                style={{ margin: "8px 0 0", fontSize: 28, fontWeight: 700 }}
                                                            >
                                                                {item.value}
                                                            </Title>
                                                        </div>
                                                        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${iconClass}`} style={{ fontSize: 20 }}>
                                                            {item.icon}
                                                        </div>
                                                    </div>
                                                    {item.meta && (
                                                        <>
                                                            <Divider style={{ margin: "8px 0" }} />
                                                            {item.meta}
                                                        </>
                                                    )}
                                                    <div className="flex items-center justify-center pt-2 border-t border-slate-100">
                                                        <Text type="secondary" className="text-xs flex items-center gap-1">
                                                            {isExpanded ? (
                                                                <>
                                                                    <UpOutlined /> Click to collapse
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <DownOutlined /> Click for details
                                                                </>
                                                            )}
                                                        </Text>
                                                    </div>
                                                </Space>
                                            </Card>
                                        </Col>
                                    );
                                })}
                            </Row>
                        </div>

                        {/* Expandable Detail Panels */}
                        {expandedPanels.length > 0 && (
                            <div className="mb-6 space-y-4">
                                <Collapse
                                    activeKey={expandedPanels}
                                    onChange={(keys) => setExpandedPanels(keys)}
                                    className="bg-transparent border-0"
                                    expandIcon={({ isActive }) => isActive ? <UpOutlined /> : <DownOutlined />}
                                    items={highlightCards
                                        .filter(item => expandedPanels.includes(item.key))
                                        .map(item => ({
                                            key: item.key,
                                            label: (
                                                <Space>
                                                    {item.icon}
                                                    <Text strong>{item.title} Details</Text>
                                                </Space>
                                            ),
                                            children: (
                                                <>
                                                    {item.key === 'bookings' && (
                                                        <BookingsDetailPanel 
                                                            stats={stats} 
                                                            upcomingBookings={upcomingBookings} 
                                                        />
                                                    )}
                                                    {item.key === 'members' && (
                                                        <MembersDetailPanel stats={stats} />
                                                    )}
                                                    {item.key === 'rentals' && (
                                                        <RentalsDetailPanel 
                                                            stats={stats} 
                                                            summary={dashboardSummary?.rentals || {}} 
                                                        />
                                                    )}
                                                    {item.key === 'equipment' && (
                                                        <EquipmentDetailPanel 
                                                            stats={stats} 
                                                            equipment={equipment} 
                                                        />
                                                    )}
                                                    {item.key === 'revenue' && (
                                                        <RevenueDetailPanel 
                                                            stats={stats} 
                                                            summary={dashboardSummary?.revenue || {}} 
                                                        />
                                                    )}
                                                </>
                                            ),
                                            className: 'bg-white rounded-xl mb-2 shadow-sm border'
                                        }))}
                                />
                            </div>
                        )}

                        {/* Summary Grid */}
                        {dashboardSummary && (
                            <DashboardSummaryGrid
                                summary={dashboardSummary}
                                timeframeLabel={summaryTimeframeLabel}
                                generatedLabel={summaryGeneratedLabel}
                                canViewFinance={canViewFinance}
                            />
                        )}
                    </div>
                )}
            </div>

            {/* Quick Action Modals */}
            <Suspense fallback={<Spin />}>
                {showBookingModal && (
                    <CalendarProvider>
                        <StepBookingModal
                            isOpen={showBookingModal}
                            onClose={() => setShowBookingModal(false)}
                            onBookingCreated={() => {
                                setShowBookingModal(false);
                                handleModalSuccess();
                            }}
                        />
                    </CalendarProvider>
                )}
            </Suspense>

            <Suspense fallback={<Spin />}>
                {showRentalModal && (
                    <QuickRentalModal
                        open={showRentalModal}
                        onClose={() => setShowRentalModal(false)}
                        onSuccess={() => {
                            setShowRentalModal(false);
                            handleModalSuccess();
                        }}
                    />
                )}
            </Suspense>

            <Suspense fallback={<Spin />}>
                {showCustomerModal && (
                    <QuickCustomerModal
                        open={showCustomerModal}
                        onClose={() => setShowCustomerModal(false)}
                        onSuccess={() => {
                            setShowCustomerModal(false);
                            handleModalSuccess();
                        }}
                    />
                )}
            </Suspense>

            <Suspense fallback={<Spin />}>
                {showAccommodationModal && (
                    <QuickAccommodationModal
                        open={showAccommodationModal}
                        onClose={() => setShowAccommodationModal(false)}
                        onSuccess={() => {
                            setShowAccommodationModal(false);
                            handleModalSuccess();
                        }}
                    />
                )}
            </Suspense>

            <Suspense fallback={<Spin />}>
                {showShopSaleModal && (
                    <QuickShopSaleModal
                        open={showShopSaleModal}
                        onClose={() => setShowShopSaleModal(false)}
                        onSuccess={() => {
                            setShowShopSaleModal(false);
                            handleModalSuccess();
                        }}
                    />
                )}
            </Suspense>

            <Suspense fallback={<Spin />}>
                {showMembershipModal && (
                    <QuickMembershipModal
                        open={showMembershipModal}
                        onClose={() => setShowMembershipModal(false)}
                        onSuccess={() => {
                            setShowMembershipModal(false);
                            handleModalSuccess();
                        }}
                    />
                )}
            </Suspense>
        </div>
    );
}

export default Dashboard;
