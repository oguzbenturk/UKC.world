import { useState, useEffect, useCallback } from 'react';
import {
    Alert,
    Button,
    Card,
    Input,
    Modal,
    Pagination,
    Space,
    Table,
    Tag,
    Tooltip,
    Typography
} from 'antd';
import { InfoCircleOutlined, RollbackOutlined } from '@ant-design/icons';
import apiClient from '../../shared/services/apiClient';
import { logger } from '../../shared/utils/logger';

const { Title, Text } = Typography;

const formatDate = (dateString) =>
    new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

const formatTime = (hour) => {
    const hours = Math.floor(hour);
    const minutes = Math.round((hour - hours) * 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

const DeletedBookingsPage = () => {
    const [deletedBookings, setDeletedBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedBooking, setSelectedBooking] = useState(null);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [restoreOpen, setRestoreOpen] = useState(false);
    const [pagination, setPagination] = useState({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0
    });
    const [filters, setFilters] = useState({ q: '', dateFrom: '', dateTo: '' });

    const fetchDeletedBookings = useCallback(async (page = 1) => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            params.set('page', String(page));
            params.set('limit', String(pagination.limit));
            if (filters.q) params.set('q', filters.q);
            if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
            if (filters.dateTo) params.set('dateTo', filters.dateTo);
            const response = await apiClient.get(`/bookings/deleted/list?${params.toString()}`);
            setDeletedBookings(response.data.data);
            setPagination(response.data.pagination);
        } catch (error) {
            logger.error('Error fetching deleted bookings', { error: error?.message || String(error) });
            setError('Failed to fetch deleted bookings');
        } finally {
            setLoading(false);
        }
    }, [pagination.limit, filters.q, filters.dateFrom, filters.dateTo]);

    useEffect(() => {
        fetchDeletedBookings();
    }, [fetchDeletedBookings]);

    const handleRestore = async () => {
        if (!selectedBooking) return;
        try {
            await apiClient.post(`/bookings/${selectedBooking.id}/restore`);
            setRestoreOpen(false);
            setSelectedBooking(null);
            await fetchDeletedBookings(pagination.page);
            setError(null);
        } catch (error) {
            logger.error('Error restoring booking', { error: error?.message || String(error) });
            setError('Failed to restore booking');
        }
    };

    const formatDeletionMetadata = (metadata) => {
        if (!metadata) return {};
        try {
            return typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
        } catch {
            return {};
        }
    };

    const columns = [
        {
            title: 'Booking ID',
            dataIndex: 'id',
            key: 'id',
            render: (id) => <Text strong>#{id}</Text>
        },
        {
            title: 'Student',
            key: 'student',
            render: (_, r) => `${r.user_first_name} ${r.user_last_name}`
        },
        {
            title: 'Instructor',
            key: 'instructor',
            render: (_, r) => `${r.instructor_first_name} ${r.instructor_last_name}`
        },
        {
            title: 'Service',
            dataIndex: 'service_name',
            key: 'service_name'
        },
        {
            title: 'Date & Time',
            key: 'datetime',
            render: (_, r) => (
                <div>
                    <div>{formatDate(r.date)}</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {formatTime(r.start_hour)} - {formatTime(r.start_hour + (r.duration || 1))}
                    </Text>
                </div>
            )
        },
        {
            title: 'Deleted At',
            dataIndex: 'deleted_at',
            key: 'deleted_at',
            render: (v) => formatDate(v)
        },
        {
            title: 'Deleted By',
            key: 'deleted_by',
            render: (_, r) => `${r.deleted_by_first_name} ${r.deleted_by_last_name}`
        },
        {
            title: 'Reason',
            dataIndex: 'deletion_reason',
            key: 'deletion_reason',
            render: (v) => <Tag>{v || 'No reason provided'}</Tag>
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, booking) => (
                <Space>
                    <Tooltip title="View Details">
                        <Button
                            type="text"
                            size="small"
                            icon={<InfoCircleOutlined />}
                            onClick={() => { setSelectedBooking(booking); setDetailsOpen(true); }}
                        />
                    </Tooltip>
                    <Tooltip title="Restore Booking">
                        <Button
                            type="text"
                            size="small"
                            icon={<RollbackOutlined />}
                            onClick={() => { setSelectedBooking(booking); setRestoreOpen(true); }}
                        />
                    </Tooltip>
                </Space>
            )
        }
    ];

    return (
        <div className="p-6">
            <Title level={3}>Deleted Bookings Management</Title>

            <Space wrap className="mb-4">
                <Input
                    size="small"
                    placeholder="Search (student, instructor, service, reason)"
                    value={filters.q}
                    onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                    style={{ width: 320 }}
                />
                <Input
                    size="small"
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                    style={{ width: 140 }}
                    placeholder="From"
                />
                <Input
                    size="small"
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                    style={{ width: 140 }}
                    placeholder="To"
                />
                <Button onClick={() => fetchDeletedBookings(1)}>Apply</Button>
                <Button onClick={() => { setFilters({ q: '', dateFrom: '', dateTo: '' }); fetchDeletedBookings(1); }}>Reset</Button>
            </Space>

            <Card className="mb-4">
                <Title level={5} style={{ marginBottom: 4 }}>Soft Delete System</Title>
                <Text type="secondary">
                    Deleted bookings are safely preserved here. They can be restored if needed,
                    and are automatically backed up before permanent deletion.
                </Text>
            </Card>

            {error && <Alert type="error" message={error} className="mb-4" showIcon />}

            <Table
                columns={columns}
                dataSource={deletedBookings}
                rowKey="id"
                loading={loading}
                pagination={false}
                scroll={{ x: 'max-content' }}
                size="small"
            />

            {pagination.totalPages > 1 && (
                <div className="flex justify-center mt-4">
                    <Pagination
                        current={pagination.page}
                        total={pagination.total}
                        pageSize={pagination.limit}
                        onChange={(page) => { setPagination((p) => ({ ...p, page })); fetchDeletedBookings(page); }}
                        showSizeChanger={false}
                    />
                </div>
            )}

            {/* Details Modal */}
            <Modal
                title="Booking Details"
                open={detailsOpen}
                onCancel={() => setDetailsOpen(false)}
                footer={<Button onClick={() => setDetailsOpen(false)}>Close</Button>}
                width={600}
            >
                {selectedBooking && (
                    <div className="pt-2 space-y-4">
                        <div>
                            <Title level={5}>Booking Information</Title>
                            <div className="space-y-1">
                                <div><Text strong>ID:</Text> #{selectedBooking.id}</div>
                                <div><Text strong>Date:</Text> {formatDate(selectedBooking.date)}</div>
                                <div><Text strong>Time:</Text> {formatTime(selectedBooking.start_hour)} - {formatTime(selectedBooking.start_hour + (selectedBooking.duration || 1))}</div>
                                <div><Text strong>Amount:</Text> ${selectedBooking.final_amount}</div>
                                <div><Text strong>Status:</Text> {selectedBooking.status}</div>
                            </div>
                        </div>
                        <div>
                            <Title level={5}>Deletion Information</Title>
                            <div className="space-y-1">
                                <div><Text strong>Deleted At:</Text> {new Date(selectedBooking.deleted_at).toLocaleString()}</div>
                                <div><Text strong>Deleted By:</Text> {selectedBooking.deleted_by_first_name} {selectedBooking.deleted_by_last_name}</div>
                                <div><Text strong>Reason:</Text> {selectedBooking.deletion_reason}</div>
                            </div>
                        </div>
                        {selectedBooking.deletion_metadata && (
                            <div>
                                <Title level={5}>Additional Metadata</Title>
                                <div className="bg-gray-50 p-3 rounded">
                                    <pre style={{ margin: 0, fontSize: 12 }}>
                                        {JSON.stringify(formatDeletionMetadata(selectedBooking.deletion_metadata), null, 2)}
                                    </pre>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            {/* Restore Confirmation Modal */}
            <Modal
                title="Restore Booking"
                open={restoreOpen}
                onCancel={() => setRestoreOpen(false)}
                footer={
                    <Space>
                        <Button onClick={() => setRestoreOpen(false)}>Cancel</Button>
                        <Button type="primary" onClick={handleRestore}>Restore Booking</Button>
                    </Space>
                }
            >
                <p>Are you sure you want to restore this booking? It will be moved back to the active bookings list.</p>
                {selectedBooking && (
                    <div className="mt-3 p-3 bg-gray-50 rounded space-y-1">
                        <div><Text strong>Booking ID:</Text> #{selectedBooking.id}</div>
                        <div><Text strong>Student:</Text> {selectedBooking.user_first_name} {selectedBooking.user_last_name}</div>
                        <div><Text strong>Date:</Text> {formatDate(selectedBooking.date)}</div>
                        <div><Text strong>Time:</Text> {formatTime(selectedBooking.start_hour)}</div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default DeletedBookingsPage;
