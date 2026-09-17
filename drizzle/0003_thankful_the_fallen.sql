CREATE TABLE `employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeCode` varchar(40) NOT NULL,
	`name` varchar(180) NOT NULL,
	`phone` varchar(40),
	`role` enum('Operator','Head Operator','Cutting Master','Helper','QC Staff','Printing Staff','Packing Staff','Manager','Other') NOT NULL DEFAULT 'Operator',
	`department` varchar(100),
	`joiningDate` timestamp,
	`status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employees_id` PRIMARY KEY(`id`),
	CONSTRAINT `employees_code_unique` UNIQUE(`employeeCode`)
);
--> statement-breakpoint
CREATE TABLE `machines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`machineCode` varchar(40) NOT NULL,
	`machineType` varchar(100) NOT NULL,
	`brandModel` varchar(160),
	`assignedEmployeeId` int,
	`status` enum('ACTIVE','MAINTENANCE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
	`location` varchar(120),
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `machines_id` PRIMARY KEY(`id`),
	CONSTRAINT `machines_code_unique` UNIQUE(`machineCode`)
);
--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `employees_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `machines` ADD CONSTRAINT `machines_assignedEmployeeId_employees_id_fk` FOREIGN KEY (`assignedEmployeeId`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `machines` ADD CONSTRAINT `machines_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `employees_status_idx` ON `employees` (`status`);--> statement-breakpoint
CREATE INDEX `machines_status_idx` ON `machines` (`status`);--> statement-breakpoint
CREATE INDEX `machines_employee_idx` ON `machines` (`assignedEmployeeId`);