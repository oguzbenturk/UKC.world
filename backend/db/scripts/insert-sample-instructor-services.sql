-- insert-sample-instructor-services.sql
-- First make sure we have instructor and service IDs to work with
DO $$
DECLARE
    instructorId UUID;
    serviceArray UUID[] := ARRAY[]::UUID[];
    serviceId UUID;
BEGIN
    -- Get first instructor ID
    SELECT u.id INTO instructorId
    FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE r.name = 'instructor'
    LIMIT 1;
    
    IF instructorId IS NULL THEN
        RAISE NOTICE 'No instructors found. Please create an instructor first.';
        RETURN;
    END IF;
    
    RAISE NOTICE 'Using instructor ID: %', instructorId;
    
    -- Collect service IDs
    FOR serviceId IN 
        SELECT id FROM services LIMIT 5
    LOOP
        serviceArray := array_append(serviceArray, serviceId);
    END LOOP;
    
    IF array_length(serviceArray, 1) IS NULL THEN
        RAISE NOTICE 'No services found. Please create services first.';
        RETURN;
    END IF;
    
    RAISE NOTICE 'Found % services to assign', array_length(serviceArray, 1);
    
    -- Assign each service to the instructor
    FOREACH serviceId IN ARRAY serviceArray
    LOOP
        -- Check if already assigned
        IF NOT EXISTS (
            SELECT 1 FROM instructor_services 
            WHERE instructor_id = instructorId AND service_id = serviceId
        ) THEN
            RAISE NOTICE 'Assigning service % to instructor %', serviceId, instructorId;
            INSERT INTO instructor_services (instructor_id, service_id)
            VALUES (instructorId, serviceId);
        ELSE
            RAISE NOTICE 'Service % already assigned to instructor %', serviceId, instructorId;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Sample data inserted successfully';
END $$;
