import { useState, useEffect, useCallback } from 'react';
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableContainer, 
    TableHead, 
    TableRow, 
    Paper, 
    Button, 
    Typography, 
    Box,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Alert,
    Pagination,
    IconButton,
    Tooltip,
    Card,
    CardContent,
    TextField,
    Stack
} from '@mui/material';
import { 
    RestoreFromTrash as RestoreIcon, 
    Info as InfoIcon,
    
} from '@mui/icons-material';
import apiClient from '../../shared/services/apiClient';
import { logger } from '../../shared/utils/logger';

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
            // Show success message
            setError(null);
        } catch (error) {
            logger.error('Error restoring booking', { error: error?.message || String(error) });
            setError('Failed to restore booking');
        }
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const formatTime = (hour) => {
        const hours = Math.floor(hour);
        const minutes = Math.round((hour - hours) * 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    };

    const formatDeletionMetadata = (metadata) => {
        if (!metadata) return {};
        try {
            return typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
        } catch {
            return {};
        }
    };

    const handlePageChange = (event, newPage) => {
        setPagination(prev => ({ ...prev, page: newPage }));
        fetchDeletedBookings(newPage);
    };

    if (loading && deletedBookings.length === 0) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
                <Typography>Loading deleted bookings...</Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h4" gutterBottom>
                Deleted Bookings Management
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
                <TextField
                    size="small"
                    label="Search (student, instructor, service, reason)"
                    value={filters.q}
                    onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                />
                <TextField
                    size="small"
                    label="From"
                    type="date"
                    InputLabelProps={{ shrink: true }}
                    value={filters.dateFrom}
                    onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                />
                <TextField
                    size="small"
                    label="To"
                    type="date"
                    InputLabelProps={{ shrink: true }}
                    value={filters.dateTo}
                    onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                />
                <Button variant="outlined" onClick={() => fetchDeletedBookings(1)}>Apply</Button>
                <Button onClick={() => { setFilters({ q: '', dateFrom: '', dateTo: '' }); fetchDeletedBookings(1); }}>Reset</Button>
            </Stack>
            
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Typography variant="h6" gutterBottom>
                        Soft Delete System
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Deleted bookings are safely preserved here. They can be restored if needed, 
                        and are automatically backed up before permanent deletion.
                    </Typography>
                </CardContent>
            </Card>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                </Alert>
            )}

            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Booking ID</TableCell>
                            <TableCell>Student</TableCell>
                            <TableCell>Instructor</TableCell>
                            <TableCell>Service</TableCell>
                            <TableCell>Date & Time</TableCell>
                            <TableCell>Deleted At</TableCell>
                            <TableCell>Deleted By</TableCell>
                            <TableCell>Reason</TableCell>
                            <TableCell>Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {deletedBookings.map((booking) => {
                            return (
                                <TableRow key={booking.id}>
                                    <TableCell>
                                        <Typography variant="body2" fontWeight="bold">
                                            #{booking.id}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        {booking.user_first_name} {booking.user_last_name}
                                    </TableCell>
                                    <TableCell>
                                        {booking.instructor_first_name} {booking.instructor_last_name}
                                    </TableCell>
                                    <TableCell>{booking.service_name}</TableCell>
                                    <TableCell>
                                        <Box>
                                            <Typography variant="body2">
                                                {formatDate(booking.date)}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {formatTime(booking.start_hour)} - {formatTime(booking.start_hour + (booking.duration || 1))}
                                            </Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2">
                                            {formatDate(booking.deleted_at)}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        {booking.deleted_by_first_name} {booking.deleted_by_last_name}
                                    </TableCell>
                                    <TableCell>
                                        <Chip 
                                            label={booking.deletion_reason || 'No reason provided'} 
                                            variant="outlined" 
                                            size="small"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Box display="flex" gap={1}>
                                            <Tooltip title="View Details">
                                                <IconButton
                                                    size="small"
                                                    onClick={() => {
                                                        setSelectedBooking(booking);
                                                        setDetailsOpen(true);
                                                    }}
                                                >
                                                    <InfoIcon />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Restore Booking">
                                                <IconButton
                                                    size="small"
                                                    color="primary"
                                                    onClick={() => {
                                                        setSelectedBooking(booking);
                                                        setRestoreOpen(true);
                                                    }}
                                                >
                                                    <RestoreIcon />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>

            {pagination.totalPages > 1 && (
                <Box display="flex" justifyContent="center" mt={3}>
                    <Pagination
                        count={pagination.totalPages}
                        page={pagination.page}
                        onChange={handlePageChange}
                        color="primary"
                    />
                </Box>
            )}

            {/* Details Dialog */}
            <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>Booking Details</DialogTitle>
                <DialogContent>
                    {selectedBooking && (
                        <Box sx={{ pt: 2 }}>
                            <Typography variant="h6" gutterBottom>
                                Booking Information
                            </Typography>
                            <Box sx={{ mb: 2 }}>
                                <Typography><strong>ID:</strong> #{selectedBooking.id}</Typography>
                                <Typography><strong>Date:</strong> {formatDate(selectedBooking.date)}</Typography>
                                <Typography><strong>Time:</strong> {formatTime(selectedBooking.start_hour)} - {formatTime(selectedBooking.start_hour + (selectedBooking.duration || 1))}</Typography>
                                <Typography><strong>Amount:</strong> ${selectedBooking.final_amount}</Typography>
                                <Typography><strong>Status:</strong> {selectedBooking.status}</Typography>
                            </Box>
                            
                            <Typography variant="h6" gutterBottom>
                                Deletion Information
                            </Typography>
                            <Box sx={{ mb: 2 }}>
                                <Typography><strong>Deleted At:</strong> {new Date(selectedBooking.deleted_at).toLocaleString()}</Typography>
                                <Typography><strong>Deleted By:</strong> {selectedBooking.deleted_by_first_name} {selectedBooking.deleted_by_last_name}</Typography>
                                <Typography><strong>Reason:</strong> {selectedBooking.deletion_reason}</Typography>
                            </Box>

                            {selectedBooking.deletion_metadata && (
                                <>
                                    <Typography variant="h6" gutterBottom>
                                        Additional Metadata
                                    </Typography>
                                    <Box sx={{ backgroundColor: '#f5f5f5', p: 2, borderRadius: 1 }}>
                                        <pre style={{ margin: 0, fontSize: '12px' }}>
                                            {JSON.stringify(formatDeletionMetadata(selectedBooking.deletion_metadata), null, 2)}
                                        </pre>
                                    </Box>
                                </>
                            )}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDetailsOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* Restore Confirmation Dialog */}
            <Dialog open={restoreOpen} onClose={() => setRestoreOpen(false)}>
                <DialogTitle>Restore Booking</DialogTitle>
                <DialogContent>
                    <Typography>
                        Are you sure you want to restore this booking? It will be moved back to the active bookings list.
                    </Typography>
                    {selectedBooking && (
                        <Box sx={{ mt: 2, p: 2, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
                            <Typography><strong>Booking ID:</strong> #{selectedBooking.id}</Typography>
                            <Typography><strong>Student:</strong> {selectedBooking.user_first_name} {selectedBooking.user_last_name}</Typography>
                            <Typography><strong>Date:</strong> {formatDate(selectedBooking.date)}</Typography>
                            <Typography><strong>Time:</strong> {formatTime(selectedBooking.start_hour)}</Typography>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRestoreOpen(false)}>Cancel</Button>
                    <Button onClick={handleRestore} variant="contained" color="primary">
                        Restore Booking
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default DeletedBookingsPage;
