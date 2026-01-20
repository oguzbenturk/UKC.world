import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Col, Empty, Modal, Row, Skeleton, Tag, Typography } from 'antd';
import { AppstoreOutlined, ArrowRightOutlined, FileTextOutlined, LinkOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useStudentCourses } from '../hooks/useStudentDashboard';
import { studentPortalApi } from '../services/studentPortalApi';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const { Paragraph } = Typography;

const PACKAGE_STATUS_COLORS = {
  active: 'blue',
  used_up: 'default',
  expired: 'red',
  pending: 'gold'
};

const normalizeText = (value) => (value || '').toString().toLowerCase();

const classifyPackage = (pkg) => {
  const haystack = normalizeText(`${pkg.name} ${pkg.lessonType}`);
  if (haystack.includes('rental')) return 'rentals';
  if (haystack.includes('accommodation') || haystack.includes('accom')) return 'accommodation';
  if (haystack.includes('shop') || haystack.includes('gear')) return 'shop';
  return 'lessons';
};

const classifyProduct = (product) => {
  const tokens = [product.category, ...(product.tags || [])];
  const metadata = product.recommendationMetadata || {};
  if (metadata.category) tokens.push(metadata.category);
  if (metadata.type) tokens.push(metadata.type);
  const text = normalizeText(tokens.filter(Boolean).join(' '));
  const matches = (keywords) => keywords.some((keyword) => text.includes(keyword));
  if (matches(['rental', 'equipment'])) return 'rentals';
  if (matches(['lesson', 'coaching', 'session', 'training'])) return 'lessons';
  if (matches(['accommodation', 'stay', 'room', 'hotel', 'apartment'])) return 'accommodation';
  if (matches(['shop', 'merch', 'gear', 'retail', 'store'])) return 'shop';
  return 'services';
};

const PackageCard = ({ pkg, formatDisplayPrice }) => {
  const status = (pkg.status || 'active').toLowerCase();
  const statusLabel = status.replace(/_/g, ' ');
  const priceLabel = formatDisplayPrice ? formatDisplayPrice(pkg.price, pkg.currency) : null;
  return (
    <Card
      className="h-full rounded-2xl border border-slate-200/70 bg-white/95 shadow-[0_12px_32px_rgba(15,23,42,0.08)]"
      title={pkg.name}
      extra={<Tag color={PACKAGE_STATUS_COLORS[status] ?? 'default'}>{statusLabel}</Tag>}
    >
      <div className="space-y-3 text-sm text-slate-600">
        {pkg.lessonType && (
          <div className="flex justify-between">
            <span>Type</span>
            <strong>{pkg.lessonType}</strong>
          </div>
        )}
        <div className="flex justify-between">
          <span>Remaining</span>
          <strong>{pkg.remainingHours ?? 0} h</strong>
        </div>
        <div className="flex justify-between">
          <span>Used</span>
          <strong>{pkg.usedHours ?? 0} h</strong>
        </div>
        <div className="flex justify-between">
          <span>Total hours</span>
          <strong>{pkg.totalHours ?? 0} h</strong>
        </div>
        {pkg.expiresAt && (
          <div className="flex justify-between">
            <span>Expires</span>
            <strong className={pkg.expiryWarning ? 'text-amber-600' : ''}>
              {new Date(pkg.expiresAt).toLocaleDateString()}
            </strong>
          </div>
        )}
        {priceLabel && (
          <div className="flex justify-between">
            <span>Purchase price</span>
            <strong>{priceLabel}</strong>
          </div>
        )}
      </div>
    </Card>
  );
};

const ProductCard = ({ product, onBrowse, formatDisplayPrice }) => {
  const priceLabel = formatDisplayPrice ? formatDisplayPrice(product.price, product.currency) : null;
  return (
    <Card
      className="h-full rounded-2xl border border-slate-200/70 bg-white/95 shadow-[0_12px_32px_rgba(15,23,42,0.08)]"
      title={product.name}
      extra={priceLabel ? <Tag color="green">{priceLabel}</Tag> : null}
    >
      <div className="flex h-full flex-col justify-between gap-3 text-sm text-slate-600">
        <Paragraph style={{ marginBottom: 0 }} ellipsis={{ rows: 3 }}>
          {product.description || 'Detailed information will appear here.'}
        </Paragraph>
        <Button
          type="primary"
          icon={<ShoppingCartOutlined />}
          onClick={() => onBrowse(product)}
          className="h-10 rounded-2xl border-0 bg-sky-600 shadow-[0_6px_18px_rgba(15,116,255,0.28)] hover:bg-sky-500"
        >
          View in shop
        </Button>
      </div>
    </Card>
  );
};

const CourseCard = ({ course, onViewResources }) => (
  <Card
    className="h-full rounded-2xl border border-slate-200/70 bg-white/95 shadow-[0_12px_32px_rgba(15,23,42,0.08)]"
    title={course.name}
    extra={course.resourceCount > 0 ? <Tag color="blue">{course.resourceCount} resources</Tag> : null}
  >
    <div className="space-y-3 text-sm text-slate-600">
      <div className="flex justify-between">
        <span>Progress</span>
        <strong>{course.progress.percent}%</strong>
      </div>
      <div className="flex justify-between">
        <span>Completed lessons</span>
        <strong>{course.progress.completedLessons} / {course.progress.totalLessons}</strong>
      </div>
      {course.durationHours && (
        <div className="flex justify-between">
          <span>Duration</span>
          <strong>{course.durationHours} h</strong>
        </div>
      )}
      {course.includes && <p className="text-xs text-slate-500">Includes: {course.includes}</p>}
      {course.resourceCount > 0 && (
        <button
          type="button"
          className="inline-flex items-center gap-2 text-sm font-medium text-sky-600 transition hover:text-sky-500"
          onClick={() => onViewResources(course.courseId, course.name)}
        >
          <FileTextOutlined /> View resources
        </button>
      )}
    </div>
  </Card>
);

const ResourceList = ({ resources }) => (
  <div className="space-y-3">
    {resources.map((resource) => (
      <div key={resource.id} className="rounded-xl border border-slate-200 p-3 shadow-sm dark:border-slate-700">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-800">{resource.title}</h4>
          <Tag>{resource.type}</Tag>
        </div>
        {resource.description && <p className="mt-1 text-xs text-slate-600">{resource.description}</p>}
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-slate-500">Uploaded {resource.createdAt?.split('T')[0]}</span>
          {resource.url && (
            <a
              href={resource.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-sky-600"
            >
              <LinkOutlined /> Open
            </a>
          )}
        </div>
      </div>
    ))}
  </div>
);

const CatalogSection = ({ title, subtitle, items, renderItem, emptyText }) => (
  <section className="rounded-3xl border border-slate-200/70 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
    <div className="border-b border-slate-200/60 px-6 py-5">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
    </div>
    <div className="px-6 py-6">
      {items.length ? (
        <Row gutter={[16, 16]}>
          {items.map((item) => (
            <Col key={item.key} xs={24} md={12} lg={8}>
              {renderItem(item)}
            </Col>
          ))}
        </Row>
      ) : (
        <div className="py-10">
          <Empty description={emptyText} />
        </div>
      )}
    </div>
  </section>
);

const StudentCourses = () => {
  const { notification } = App.useApp();
  const navigate = useNavigate();
  const { formatCurrency, convertCurrency, userCurrency, businessCurrency } = useCurrency();
  const rawOutletContext = useOutletContext();
  const outletContext = useMemo(() => rawOutletContext ?? {}, [rawOutletContext]);
  const overview = useMemo(() => outletContext?.overview ?? {}, [outletContext]);
  const { data: courses, error } = useStudentCourses();
  const [resourceModal, setResourceModal] = useState({ open: false, courseId: null, courseName: '', loading: false, items: [] });

  // Storage currency is always EUR
  const storageCurrency = businessCurrency || 'EUR';
  const showDualCurrency = userCurrency !== storageCurrency;

  // Helper to convert and format price for display with dual currency
  const formatDisplayPrice = useCallback((value, baseCurrency = 'EUR') => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return null;
    }
    // Show dual currency when base differs from user's display currency
    if (showDualCurrency && convertCurrency) {
      const converted = convertCurrency(value, baseCurrency, userCurrency);
      return `${formatCurrency(value, baseCurrency)} / ${formatCurrency(converted, userCurrency)}`;
    }
    const converted = convertCurrency ? convertCurrency(value, baseCurrency, userCurrency) : value;
    return formatCurrency(converted, userCurrency);
  }, [convertCurrency, formatCurrency, userCurrency, showDualCurrency]);

  useEffect(() => {
    if (error) {
      notification.error({
        message: 'Unable to load lessons',
        description: error.message,
        placement: 'bottomRight'
      });
    }
  }, [error, notification]);

  const packages = useMemo(() => Array.isArray(overview?.packages) ? overview.packages : [], [overview]);
  const recommendedProducts = useMemo(
    () => Array.isArray(overview?.recommendations) ? overview.recommendations : overview?.recommendedProducts || [],
    [overview]
  );

  const packageGroups = useMemo(() => {
    const groups = { rentals: [], lessons: [], accommodation: [], shop: [], other: [] };
    packages.forEach((pkg) => {
      const bucket = classifyPackage(pkg);
      if (groups[bucket]) {
        groups[bucket].push(pkg);
      } else {
        groups.other.push(pkg);
      }
    });
    return groups;
  }, [packages]);

  const productGroups = useMemo(() => {
    const groups = { rentals: [], lessons: [], accommodation: [], shop: [], services: [] };
    recommendedProducts.forEach((product) => {
      const bucket = classifyProduct(product);
      if (groups[bucket]) {
        groups[bucket].push(product);
      } else {
        groups.services.push(product);
      }
    });
    return groups;
  }, [recommendedProducts]);

  const packageStats = useMemo(() => {
    const totalPackages = packages.length;
    const activePackages = packages.filter((pkg) => (pkg.status || '').toLowerCase() === 'active').length;
    const lessonPackages = packageGroups.lessons.length;
    const recommendations = recommendedProducts.length;
    return { totalPackages, activePackages, lessonPackages, recommendations };
  }, [packageGroups.lessons.length, packages, recommendedProducts.length]);

  const rentalItems = useMemo(() => {
    const items = packageGroups.rentals.map((pkg) => ({ key: `pkg-${pkg.id}`, type: 'package', value: pkg }));
    if (items.length || !productGroups.rentals.length) {
      return items;
    }
    return productGroups.rentals.map((product) => ({ key: `product-${product.id}`, type: 'product', value: product }));
  }, [packageGroups.rentals, productGroups.rentals]);

  const lessonPackageItems = useMemo(() => {
    const items = packageGroups.lessons.map((pkg) => ({ key: `pkg-${pkg.id}`, type: 'package', value: pkg }));
    return items;
  }, [packageGroups.lessons]);

  const individualLessonItems = useMemo(() => {
    const productItems = productGroups.lessons.map((product) => ({ key: `product-${product.id}`, type: 'product', value: product }));
    const courseItems = Array.isArray(courses)
      ? courses.map((course) => ({ key: `course-${course.courseId}`, type: 'course', value: course }))
      : [];
    return [...productItems, ...courseItems];
  }, [productGroups.lessons, courses]);

  const accommodationItems = useMemo(() => (
    productGroups.accommodation.map((product) => ({ key: `product-${product.id}`, type: 'product', value: product }))
  ), [productGroups.accommodation]);

  const shopItems = useMemo(() => (
    productGroups.shop.map((product) => ({ key: `product-${product.id}`, type: 'product', value: product }))
  ), [productGroups.shop]);

  const handleCloseResources = () => setResourceModal({ open: false, courseId: null, courseName: '', loading: false, items: [] });

  const openResources = useCallback(async (courseId, courseName) => {
    setResourceModal((prev) => ({ ...prev, open: true, courseId, courseName, loading: true }));
    try {
      const resources = await studentPortalApi.fetchCourseResources(courseId);
      setResourceModal({ open: true, courseId, courseName, loading: false, items: resources });
    } catch (fetchError) {
      setResourceModal({ open: false, courseId: null, courseName: '', loading: false, items: [] });
      notification.error({
        message: 'Unable to fetch resources',
        description: fetchError.message,
        placement: 'bottomRight'
      });
    }
  }, [notification]);

  const handleBrowse = useCallback((product) => {
    navigate('/shop', { state: { highlightProductId: product?.id } });
  }, [navigate]);

  const browseShop = useCallback(() => {
    navigate('/shop');
  }, [navigate]);

  const openBookingWizard = useCallback((detail = {}) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('studentBooking:open', { detail }));
  }, []);

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-sky-500 via-sky-600 to-indigo-600 p-6 text-white shadow-[0_18px_42px_rgba(29,78,216,0.28)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch lg:justify-between">
          <div className="flex-1 space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/80 shadow-sm">
              <AppstoreOutlined /> Packages & Services
            </div>
            <div className="space-y-3">
              <h2 className="text-3xl font-semibold leading-tight">Everything you need for your next session</h2>
              <Paragraph style={{ marginBottom: 0 }} className="!text-sm !text-white/75">
                Review what you already own, explore curated add-ons, and jump straight into booking when you&apos;re ready.
              </Paragraph>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/22 bg-white/14 p-3 text-center shadow-[0_10px_26px_rgba(24,64,192,0.28)] backdrop-blur">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/90">Total</p>
                <p className="mt-2 text-2xl font-semibold text-white">{packageStats.totalPackages}</p>
                <p className="mt-1 text-[11px] text-white/70">Packages owned</p>
              </div>
              <div className="rounded-2xl border border-white/20 bg-white/12 p-3 text-center shadow-[0_10px_26px_rgba(58,196,255,0.26)] backdrop-blur">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/90">Active</p>
                <p className="mt-2 text-2xl font-semibold text-white">{packageStats.activePackages}</p>
                <p className="mt-1 text-[11px] text-white/70">Ready now</p>
              </div>
              <div className="rounded-2xl border border-white/18 bg-white/12 p-3 text-center shadow-[0_10px_26px_rgba(94,225,255,0.24)] backdrop-blur">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/90">Lesson</p>
                <p className="mt-2 text-2xl font-semibold text-white">{packageStats.lessonPackages}</p>
                <p className="mt-1 text-[11px] text-white/70">Bundles set</p>
              </div>
              <div className="rounded-2xl border border-white/18 bg-white/12 p-3 text-center shadow-[0_10px_26px_rgba(127,231,174,0.26)] backdrop-blur">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/90">Suggestions</p>
                <p className="mt-2 text-2xl font-semibold text-white">{packageStats.recommendations}</p>
                <p className="mt-1 text-[11px] text-white/70">Ideas to explore</p>
              </div>
            </div>
          </div>
          <div className="flex w-full max-w-xs flex-col gap-3 rounded-3xl border border-white/15 bg-white/14 p-5 backdrop-blur-xl shadow-[0_16px_36px_rgba(14,58,190,0.32)] lg:w-80">
            <p className="text-sm text-white/80">Explore our offerings: Buy packages, book services, or become a VIP member.</p>
            <Button
              type="primary"
              icon={<ShoppingCartOutlined />}
              onClick={() => openBookingWizard({ showBuyPackages: true })}
              className="h-11 rounded-2xl border-0 bg-white text-sky-600 shadow-[0_10px_25px_rgba(11,78,240,0.35)] transition hover:bg-slate-100"
            >
              Buy a Package
            </Button>
            <Button
              ghost
              icon={<ArrowRightOutlined />}
              onClick={openBookingWizard}
              className="h-11 rounded-2xl border-white/45 text-white shadow-[0_8px_22px_rgba(255,255,255,0.22)] hover:bg-white/15"
            >
              Book a Service
            </Button>
            <Button
              ghost
              icon={<AppstoreOutlined />}
              onClick={() => navigate('/members/offerings')}
              className="h-11 rounded-2xl border-white/45 text-white shadow-[0_8px_22px_rgba(255,255,255,0.22)] hover:bg-white/15"
            >
              Buy Membership
            </Button>
          </div>
        </div>
      </div>

      <CatalogSection
        title="Rental packages"
        subtitle="Ready-to-go gear and equipment bundles for the slopes."
        items={rentalItems}
        emptyText="You don&apos;t have any rental packages yet."
        renderItem={(item) => (
          item.type === 'package'
            ? <PackageCard pkg={item.value} formatDisplayPrice={formatDisplayPrice} />
            : <ProductCard product={item.value} onBrowse={handleBrowse} formatDisplayPrice={formatDisplayPrice} />
        )}
      />

      <CatalogSection
        title="Lesson packages"
        subtitle="Multi-session bundles to keep the progression going."
        items={lessonPackageItems}
        emptyText="You don&apos;t have any lesson packages yet."
        renderItem={(item) => <PackageCard pkg={item.value} formatDisplayPrice={formatDisplayPrice} />}
      />

      <CatalogSection
        title="Individual lessons"
        subtitle="Book a one-off lesson or unlock course resources."
        items={individualLessonItems}
        emptyText="No individual lessons available right now."
        renderItem={(item) => {
          if (item.type === 'product') {
            return <ProductCard product={item.value} onBrowse={handleBrowse} formatDisplayPrice={formatDisplayPrice} />;
          }
          return <CourseCard course={item.value} onViewResources={openResources} />;
        }}
      />

      <CatalogSection
        title="Accommodation"
        subtitle="Stay options curated around your training schedule."
        items={accommodationItems}
        emptyText="No accommodation offers available yet."
        renderItem={(item) => <ProductCard product={item.value} onBrowse={handleBrowse} />}
      />

      <CatalogSection
        title="Shop & gear"
        subtitle="Upgrade your setup with apparel, accessories, and add-ons."
        items={shopItems}
        emptyText="Browse the shop for equipment, apparel, or add-ons."
        renderItem={(item) => <ProductCard product={item.value} onBrowse={handleBrowse} />}
      />

      <Modal
        title={`Resources · ${resourceModal.courseName}`}
        open={resourceModal.open}
        onCancel={handleCloseResources}
        footer={null}
        width={640}
      >
        {resourceModal.loading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : resourceModal.items.length ? (
          <ResourceList resources={resourceModal.items} />
        ) : (
          <Empty description="No resources added yet" />
        )}
      </Modal>
    </div>
  );
};

export default StudentCourses;
