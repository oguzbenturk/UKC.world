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
    StarOutlined,
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

// Clean accent styles
const accentStyles = {
    blue: "bg-white border-blue-100/50 hover:border-blue-200 shadow-sm hover:shadow-md",
    emerald: "bg-white border-emerald-100/50 hover:border-emerald-200 shadow-sm hover:shadow-md",
    indigo: "bg-white border-indigo-100/50 hover:border-indigo-200 shadow-sm hover:shadow-md",
    orange: "bg-white border-orange-100/50 hover:border-gray-200 shadow-sm hover:shadow-md",
    violet: "bg-white border-violet-100/50 hover:border-violet-200 shadow-sm hover:shadow-md"
};

const iconBgStyles = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    indigo: "bg-indigo-50 text-indigo-600",
    orange: "bg-orange-50 text-orange-600",
    violet: "bg-violet-50 text-violet-600"
};

const LessonSummaryCard = ({ summary = {}, timeframeLabel, generatedLabel }) => {
    const metrics = [
        { label: "Total lessons", value: formatNumber(summary.total), icon: <CalendarOutlined /> },
        { label: "Completed", value: formatNumber(summary.completed), icon: <CheckCircleOutlined /> },
        { label: "Upcoming", value: formatNumber(summary.upcoming), icon: <ClockCircleOutlined /> },
        { label: "Lesson hours", value: formatHours(summary.totalHours), icon: <ClockCircleOutlined /> },
        {
            label: "Completion",
            value: `${((Number(summary.completionRate) || 0) * 100).toFixed(1)}%`,
            icon: <LineChartOutlined />
        },
        { label: "Avg duration", value: formatHours(summary.averageDuration), icon: <ClockCircleOutlined /> }
    ];

    return (
        <Card
            title={
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                        <LineChartOutlined style={{ fontSize: 18 }} />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-slate-800 m-0">Lesson Overview</h4>
                        <Text type="secondary" style={{ fontSize: 11 }}>{timeframeLabel}</Text>
                    </div>
                </div>
            }
            extra={
                generatedLabel ? (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                        Updated {generatedLabel}
                    </Text>
                ) : null
            }
            className="dashboard-card rounded-2xl border-slate-200 shadow-sm h-full"
            bodyStyle={{ padding: 24 }}
        >
            <div className="grid grid-cols-2 gap-4">
                {metrics.map((metric) => (
                    <div key={metric.label} className="flex flex-col gap-1 p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                        <Text type="secondary" className="text-xs uppercase tracking-wide font-medium text-slate-500">
                            {metric.label}
                        </Text>
                        <div className="flex items-center gap-2">
                             <Text strong className="text-lg text-slate-800">
                                {metric.value}
                            </Text>
                        </div>
                    </div>
                ))}
            </div>
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
            className="dashboard-card rounded-2xl border-slate-200 shadow-sm h-full" 
            bodyStyle={{ padding: 24 }}
        >
             <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                    <ToolOutlined style={{ fontSize: 18 }} />
                </div>
                <h4 className="text-sm font-bold text-slate-800 m-0">Rental Summary</h4>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
                {metrics.map((metric) => (
                    <div key={metric.label} className="flex flex-col gap-1 p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                         <Text type="secondary" className="text-xs uppercase tracking-wide font-medium text-slate-500">
                             {metric.label}
                        </Text>
                        <Text strong className="text-lg text-slate-800">
                            {metric.value}
                        </Text>
                    </div>
                ))}
            </div>
            
            <div className="space-y-3 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                {revenueMetrics.map((metric) => (
                    <div className="flex items-center justify-between" key={metric.label}>
                         <Text type="secondary" className="text-xs font-medium text-slate-500">{metric.label}</Text>
                         <Text strong className="text-emerald-600 font-mono">{metric.value}</Text>
                    </div>
                ))}
            </div>
        </Card>
    );
};

const FinancialSummaryCard = ({ summary = {} }) => {
    const netClass = (summary.net ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600";
    const bgClass = (summary.net ?? 0) >= 0 ? "bg-emerald-50" : "bg-rose-50";
    const netIcon = (summary.net ?? 0) >= 0 ? <LineChartOutlined /> : <LineChartOutlined className="rotate-180" />; 
    
    const metrics = [
        { label: "Income", value: formatCurrency(summary.income), icon: "📥" },
        { label: "Expenses", value: formatCurrency(summary.expenses), icon: "📤" },
        { label: "Service revenue", value: formatCurrency(summary.serviceRevenue), icon: "🎓" },
        { label: "Rental revenue", value: formatCurrency(summary.rentalRevenue), icon: "🔧" },
        { label: "Transactions", value: formatNumber(summary.transactions), icon: "📊" }
    ];

    return (
        <Card 
            className="dashboard-card rounded-2xl border-slate-200 shadow-sm h-full" 
            bodyStyle={{ padding: 24 }}
        >
             <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-violet-50 rounded-lg text-violet-600">
                    <DollarCircleOutlined style={{ fontSize: 18 }} />
                </div>
                <h4 className="text-sm font-bold text-slate-800 m-0">Financial Snapshot</h4>
            </div>

             <div className="space-y-4">
                 <div className="grid grid-cols-2 gap-3">
                     {metrics.slice(0, 2).map((metric) => (
                        <div key={metric.label} className="flex flex-col gap-1 p-3 rounded-xl bg-slate-50">
                            <Text type="secondary" className="text-xs uppercase tracking-wide font-medium text-slate-500">{metric.label}</Text>
                            <Text strong className="text-slate-800 font-mono text-base">{metric.value}</Text>
                        </div>
                     ))}
                 </div>

                 <div className={`flex flex-col gap-1 p-4 rounded-xl ${bgClass} border border-transparent`}>
                    <Text type="secondary" className="text-xs uppercase tracking-wide font-medium text-slate-500">Net Revenue</Text>
                    <div className="flex items-center justify-between">
                         <Text strong className={`text-2xl font-mono ${netClass}`}>{formatCurrency(summary.net)}</Text>
                         <div className={`text-xl ${netClass}`}>{netIcon}</div>
                    </div>
                </div>

                <div className="pt-2 space-y-2">
                    {metrics.slice(2).map((metric) => (
                        <div className="flex items-center justify-between py-1 border-b border-slate-50 last:border-0" key={metric.label}>
                             <Text type="secondary" className="text-sm text-slate-500">{metric.label}</Text>
                             <Text strong className="text-slate-700 font-mono">{metric.value}</Text>
                        </div>
                    ))}
                </div>
             </div>
        </Card>
    );
};

const DashboardSummaryGrid = ({ summary, timeframeLabel, generatedLabel }) => {
    if (!summary) {
        return null;
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div>
                <LessonSummaryCard
                    summary={summary.lessons}
                    timeframeLabel={timeframeLabel}
                    generatedLabel={generatedLabel}
                />
            </div>
            <div>
                <RentalSummaryCard summary={summary.rentals} />
            </div>
            <div>
                <FinancialSummaryCard summary={summary.revenue} />
            </div>
        </div>
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
        <div className="min-h-screen bg-slate-50 px-4 pb-20 pt-6">
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
                    transition: all 0.3s ease-out;
                }
                .dashboard-card:hover {
                    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05);
                }
                .highlight-card {
                    position: relative;
                    overflow: hidden;
                }
            `}</style>
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
                {/* Hero Section */}
                <Card
                    className="dashboard-card animate-slide-in-down rounded-3xl border border-slate-100 bg-white shadow-lg"
                    bodyStyle={{ padding: "32px 40px" }}
                >
                    <Row gutter={[24, 24]} align="middle">
                        <Col xs={24} lg={16}>
                            <Space direction="vertical" size={16} style={{ width: "100%" }}>
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-50 rounded-full text-indigo-600">
                                        <StarOutlined className="text-xl" />
                                    </div>
                                    <Tag bordered={false} className="bg-slate-100 text-slate-600 font-semibold border-0">
                                        Welcome Dashboard
                                    </Tag>
                                </div>
                                <div>
                                    <Title level={1} style={{ margin: 0, color: '#0f172a' }}>
                                        Welcome back{user?.first_name ? `, ${user.first_name}` : ""}
                                    </Title>
                                </div>
                                <Text className="text-slate-500 text-base leading-relaxed">
                                    {heroSubtitle}
                                </Text>
                                <Space wrap size={12}>
                                    <Link to="/bookings">
                                        <Button 
                                            type="primary" 
                                            icon={<CalendarOutlined />}
                                            size="large"
                                            className="bg-slate-900 border-none hover:bg-slate-800 shadow-xl shadow-slate-200"
                                            style={{ borderRadius: 12, height: 48, paddingInline: 24 }}
                                        >
                                            Manage bookings
                                        </Button>
                                    </Link>
                                    {canViewFinance && (
                                        <Link to="/finance">
                                            <Button
                                                size="large"
                                                icon={<DollarCircleOutlined />}
                                                className="border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300"
                                                style={{ borderRadius: 12, height: 48, paddingInline: 24 }}
                                            >
                                                Finance overview
                                            </Button>
                                        </Link>
                                    )}
                                </Space>
                            </Space>
                        </Col>
                        <Col xs={24} lg={8}>
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                <Space direction="vertical" size={14} style={{ width: "100%" }}>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <Text type="secondary" className="text-xs uppercase tracking-wide font-bold text-slate-400">Active Team</Text>
                                            <div className="text-3xl font-bold text-indigo-600 mt-1">
                                                {formatNumber(stats.instructors)}
                                            </div>
                                            <Text className="text-slate-400 text-xs">instructors on board</Text>
                                        </div>
                                        <div className="h-10 w-10 flex items-center justify-center bg-indigo-100 text-indigo-600 rounded-full">
                                            <TeamOutlined />
                                        </div>
                                    </div>
                                    <div className="h-px bg-slate-200 my-2" />
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Text className="text-xs font-semibold text-slate-500 block mb-1">Equipment</Text>
                                            <div className="text-lg font-bold text-slate-800">
                                                {formatNumber(stats.equipment)}
                                            </div>
                                        </div>
                                        <div>
                                            <Text className="text-xs font-semibold text-slate-500 block mb-1">Customers</Text>
                                            <div className="text-lg font-bold text-slate-800">
                                                {formatNumber(stats.users)}
                                            </div>
                                        </div>
                                    </div>
                                     <Link to="/services">
                                        <Button 
                                            type="link" 
                                            icon={<ArrowRightOutlined />}
                                            className="p-0 h-auto font-semibold text-indigo-600 hover:text-indigo-700 mt-2"
                                        >
                                            Explore services
                                        </Button>
                                    </Link>
                                </Space>
                            </div>
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
                                    <Link to={item.link} className="block h-full group">
                                        <div
                                            className={`dashboard-card h-full rounded-2xl p-5 border transition-all duration-300 ${bgClass}`}
                                            style={{ animationDelay: `${idx * 80}ms` }}
                                        >
                                            <div className="flex flex-col h-full justify-between gap-4">
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <Text 
                                                            className="text-slate-500 text-xs font-bold uppercase tracking-wider"
                                                        >
                                                            {item.title}
                                                        </Text>
                                                        <div className="text-3xl font-bold text-slate-800 mt-2 group-hover:scale-105 transition-transform origin-left">
                                                            {item.value}
                                                        </div>
                                                    </div>
                                                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${iconClass} transition-transform group-hover:rotate-6`}>
                                                        {item.icon}
                                                    </div>
                                                </div>
                                                {item.meta && (
                                                    <div className="pt-3 border-t border-slate-100 mt-auto">
                                                        {item.meta}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </Link>
                                </Col>
                            );
                        })}
                    </Row>
                </div>

                {/* Activity Sections */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card
                        title={
                            <div className="flex items-center gap-2">
                                <ClockCircleOutlined style={{ color: '#3b82f6' }} />
                                <span className="font-bold text-slate-800">Upcoming bookings</span>
                            </div>
                        }
                        extra={
                            <Link to="/bookings">
                                <Button type="text" className="text-slate-500 hover:text-blue-600 text-xs font-medium">View all</Button>
                            </Link>
                        }
                        className="dashboard-card rounded-2xl border-slate-200 shadow-sm bg-white h-full"
                        bodyStyle={{ padding: 0 }}
                    >
                        {upcomingBookingItems.length > 0 ? (
                            <div className="divide-y divide-slate-100">
                                {upcomingBookingItems.map((item, idx) => (
                                    <div 
                                        key={item.key}
                                        className="px-6 py-4 hover:bg-slate-50 transition-colors flex items-center justify-between group"
                                        style={{ animationDelay: `${idx * 50}ms` }}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 group-hover:scale-110 transition-transform">
                                                <CalendarOutlined />
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-700 text-sm mb-0.5">{item.student}</div>
                                                <div className="text-xs text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded-full inline-block">{item.service}</div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <div className="font-bold text-slate-700 text-sm">{item.dayLabel}</div>
                                            <div className="text-xs text-slate-400">{item.timeLabel}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-16 text-center">
                                <ClockCircleOutlined style={{ fontSize: 40, color: '#cbd5e1', marginBottom: 12 }} />
                                <Empty description="No upcoming bookings" />
                            </div>
                        )}
                    </Card>

                    {canViewFinance && (
                        <Card
                            title={
                                <div className="flex items-center gap-2">
                                    <DollarCircleOutlined style={{ color: '#10b981' }} />
                                    <span className="font-bold text-slate-800">Recent payments</span>
                                </div>
                            }
                            extra={
                                <Link to="/finance">
                                    <Button type="text" className="text-slate-500 hover:text-emerald-600 text-xs font-medium">View all</Button>
                                </Link>
                            }
                            className="dashboard-card rounded-2xl border-slate-200 shadow-sm bg-white h-full"
                            bodyStyle={{ padding: 0 }}
                        >
                            {paymentItems.length > 0 ? (
                                <div className="divide-y divide-slate-100">
                                    {paymentItems.map((item, idx) => (
                                        <div 
                                            key={item.key}
                                            className="px-6 py-4 hover:bg-slate-50 transition-colors flex items-center justify-between group"
                                            style={{ animationDelay: `${idx * 50}ms` }}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-110 ${item.direction === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                                    {item.direction === 'income' ? '↓' : '↑'}
                                                </div>
                                                <div>
                                                     <div className="font-bold text-slate-700 text-sm mb-0.5">{item.description}</div>
                                                     <div className="text-xs text-slate-500">{item.participantName}</div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className={`text-sm font-bold font-mono ${item.directionClass}`}>
                                                    {item.sign}{formatCurrency(item.amountDisplay, item.currency)}
                                                </div>
                                                <div className="text-xs text-slate-400">{item.formattedDate}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-16 text-center">
                                    <DollarCircleOutlined style={{ fontSize: 40, color: '#cbd5e1', marginBottom: 12 }} />
                                    <Empty description="No recent payments" />
                                </div>
                            )}
                        </Card>
                    )}
                </div>

                {/* Summary Grid */}
                {dashboardSummary && (
                    <div className="animate-fade-in pb-8">
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
