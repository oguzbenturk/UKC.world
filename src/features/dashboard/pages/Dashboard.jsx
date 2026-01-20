import { useMemo, useEffect } from "react";
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
    Progress
} from "antd";
import {
    ArrowRightOutlined,
    CalendarOutlined,
    DollarCircleOutlined,
    ShoppingOutlined,
    TeamOutlined,
    ToolOutlined,
    SparklesOutlined,
    LineChartOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined
} from "@ant-design/icons";
import { useData } from "@/shared/hooks/useData";
import { useAuth } from "@/shared/hooks/useAuth";
import { hasPermission, ROLES } from "@/shared/utils/roleUtils";
import { useDashboardRealTime } from "@/shared/hooks/useRealTime";

const { Title, Text } = Typography;

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

// Modern gradient and accent styles
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
            bodyStyle={{ padding: 24 }}
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
            bodyStyle={{ padding: 24 }}
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
            bodyStyle={{ padding: 24 }}
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

const DashboardSummaryGrid = ({ summary, timeframeLabel, generatedLabel }) => {
    if (!summary) {
        return null;
    }

    return (
        <Row gutter={[20, 20]}>
            <Col xs={24} lg={8}>
                <LessonSummaryCard
                    summary={summary.lessons}
                    timeframeLabel={timeframeLabel}
                    generatedLabel={generatedLabel}
                />
            </Col>
            <Col xs={24} lg={8}>
                <RentalSummaryCard summary={summary.rentals} />
            </Col>
            <Col xs={24} lg={8}>
                <FinancialSummaryCard summary={summary.revenue} />
            </Col>
        </Row>
    );
};

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

    const canViewFinance = hasPermission(user?.role, [ROLES.MANAGER, ROLES.ADMIN, ROLES.DEVELOPER]);
    const canViewMembers = hasPermission(user?.role, [ROLES.INSTRUCTOR, ROLES.ADMIN, ROLES.MANAGER, ROLES.DEVELOPER]);
    const canViewRentals = hasPermission(user?.role, [ROLES.MANAGER, ROLES.ADMIN, ROLES.DEVELOPER]);

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

    const heroSubtitle = useMemo(() => {
        if (!dashboardSummary?.timeframe) {
            return "Monitor activity across bookings, rentals, and revenue at a glance.";
        }
    return `Showing insights for ${summaryTimeframeLabel}.`;
    }, [dashboardSummary, summaryTimeframeLabel]);

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
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-50 to-slate-50 px-4 pb-20 pt-6">
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
                    animation: fadeIn 0.4s ease-out;
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
                    transform: translateY(-8px);
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
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
                {/* Hero Section */}
                <Card
                    className="dashboard-card animate-slide-in-down rounded-3xl border border-white/20 bg-gradient-to-br from-white/80 to-white/40 shadow-lg"
                    bodyStyle={{ padding: "32px 40px" }}
                >
                    <Row gutter={[24, 24]} align="middle">
                        <Col xs={24} lg={16}>
                            <Space direction="vertical" size={16} style={{ width: "100%" }}>
                                <div className="flex items-center gap-3">
                                    <SparklesOutlined className="text-2xl bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent" />
                                    <Tag bordered={false} color="geekblue" style={{ fontSize: 12, fontWeight: 600 }}>
                                        Welcome Dashboard
                                    </Tag>
                                </div>
                                <div>
                                    <Title level={1} style={{ margin: 0, background: 'linear-gradient(135deg, #1e293b 0%, #3b82f6 100%)', backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                        Welcome back{user?.first_name ? `, ${user.first_name}` : ""}
                                    </Title>
                                </div>
                                <Text type="secondary" style={{ fontSize: 15, lineHeight: 1.6 }}>
                                    {heroSubtitle}
                                </Text>
                                <Space wrap size={12}>
                                    <Link to="/bookings">
                                        <Button 
                                            type="primary" 
                                            icon={<CalendarOutlined />}
                                            style={{ 
                                                borderRadius: 14, 
                                                height: 48, 
                                                paddingInline: 24,
                                                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                                border: 'none',
                                                fontWeight: 600,
                                                fontSize: 14
                                            }}
                                        >
                                            Manage bookings
                                        </Button>
                                    </Link>
                                    {canViewFinance && (
                                        <Link to="/finance">
                                            <Button
                                                icon={<DollarCircleOutlined />}
                                                style={{ 
                                                    borderRadius: 14, 
                                                    height: 48, 
                                                    paddingInline: 24,
                                                    fontWeight: 600,
                                                    fontSize: 14,
                                                    borderColor: '#e2e8f0'
                                                }}
                                            >
                                                Finance overview
                                            </Button>
                                        </Link>
                                    )}
                                </Space>
                            </Space>
                        </Col>
                        <Col xs={24} lg={8}>
                            <Card
                                className="dashboard-card rounded-2xl border border-indigo-200/40 bg-gradient-to-br from-indigo-50/80 to-indigo-100/30"
                                bodyStyle={{ padding: 24 }}
                            >
                                <Space direction="vertical" size={14} style={{ width: "100%" }}>
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 13, fontWeight: 600 }}>Active team</Text>
                                        <Title level={2} style={{ margin: "8px 0 0", color: '#3b82f6' }}>
                                            {formatNumber(stats.instructors)}
                                        </Title>
                                        <Text type="secondary" style={{ fontSize: 12 }}>instructors on board</Text>
                                    </div>
                                    <Divider style={{ margin: "12px 0" }} />
                                    <Row gutter={12}>
                                        <Col span={12}>
                                            <div>
                                                <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>Equipment</Text>
                                                <div className="text-xl font-bold text-slate-900 mt-1">
                                                    {formatNumber(stats.equipment)}
                                                </div>
                                            </div>
                                        </Col>
                                        <Col span={12}>
                                            <div>
                                                <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>Customers</Text>
                                                <div className="text-xl font-bold text-slate-900 mt-1">
                                                    {formatNumber(stats.users)}
                                                </div>
                                            </div>
                                        </Col>
                                    </Row>
                                    <Link to="/services">
                                        <Button 
                                            type="link" 
                                            icon={<ArrowRightOutlined />}
                                            style={{ padding: 0, fontWeight: 600, color: '#3b82f6' }}
                                        >
                                            Explore services
                                        </Button>
                                    </Link>
                                </Space>
                            </Card>
                        </Col>
                    </Row>
                </Card>

                {/* KPI Cards Grid */}
                <div className="animate-slide-in-up">
                    <Row gutter={[16, 16]}>
                        {highlightCards.map((item, idx) => {
                            const bgClass = accentStyles[item.accent] || accentStyles.blue;
                            const iconClass = iconBgStyles[item.accent] || iconBgStyles.blue;
                            return (
                                <Col key={item.key} xs={24} sm={12} lg={6}>
                                    <Link to={item.link} className="block h-full">
                                        <Card
                                            hoverable
                                            className={`dashboard-card highlight-card h-full rounded-2xl border ${bgClass.split(' ')[4]} shadow-sm`}
                                            bodyStyle={{ padding: 20 }}
                                            style={{
                                                background: bgClass.split(' ').slice(0, 4).join(' '),
                                                animationDelay: `${idx * 80}ms`
                                            }}
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
                                            </Space>
                                        </Card>
                                    </Link>
                                </Col>
                            );
                        })}
                    </Row>
                </div>

                {/* Activity Sections */}
                <Row gutter={[16, 16]}>
                    <Col xs={24} lg={12}>
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
                            bodyStyle={{ padding: 0 }}
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
                                <div className="py-16 text-center">
                                    <ClockCircleOutlined style={{ fontSize: 40, color: '#cbd5e1', marginBottom: 12 }} />
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
                                bodyStyle={{ padding: 0 }}
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
                                    <div className="py-16 text-center">
                                        <DollarCircleOutlined style={{ fontSize: 40, color: '#cbd5e1', marginBottom: 12 }} />
                                        <Empty description="No recent payments" />
                                    </div>
                                )}
                            </Card>
                        </Col>
                    )}
                </Row>

                {/* Summary Grid */}
                {dashboardSummary && (
                    <div className="animate-fade-in">
                        <DashboardSummaryGrid
                            summary={dashboardSummary}
                            timeframeLabel={summaryTimeframeLabel}
                            generatedLabel={summaryGeneratedLabel}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

export default Dashboard;
