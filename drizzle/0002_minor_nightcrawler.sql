CREATE TABLE `attendance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`attendanceDate` timestamp NOT NULL,
	`employeeId` int NOT NULL,
	`employeeRole` varchar(80) NOT NULL,
	`status` enum('PRESENT','ABSENT','LATE','LEAVE') NOT NULL,
	`checkInTime` timestamp,
	`remarks` text,
	`isDemo` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendance_id` PRIMARY KEY(`id`),
	CONSTRAINT `attendance_date_employee_unique` UNIQUE(`attendanceDate`,`employeeId`)
);
--> statement-breakpoint
CREATE TABLE `cutting_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`cuttingTarget` int NOT NULL,
	`cutQuantity` int NOT NULL,
	`cuttingDate` timestamp NOT NULL,
	`cuttingStaffId` int NOT NULL,
	`fabricReceivedQuantity` int NOT NULL DEFAULT 0,
	`fabricIssuedQuantity` int NOT NULL DEFAULT 0,
	`status` enum('PENDING','IN PROGRESS','COMPLETED') NOT NULL DEFAULT 'PENDING',
	`remarks` text,
	`isDemo` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cutting_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `delivery_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`deliveryDate` timestamp NOT NULL,
	`deliveredQuantity` int NOT NULL,
	`deliveryStatus` enum('READY','PARTIALLY DELIVERED','DELIVERED') NOT NULL DEFAULT 'READY',
	`receiverCustomer` varchar(180),
	`deliveryNote` varchar(180),
	`remarks` text,
	`isDemo` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `delivery_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `packing_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`packingTarget` int NOT NULL,
	`packedQuantity` int NOT NULL,
	`packingDate` timestamp NOT NULL,
	`packingStaffId` int NOT NULL,
	`status` enum('PENDING','IN PROGRESS','COMPLETED') NOT NULL DEFAULT 'PENDING',
	`remarks` text,
	`isDemo` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `packing_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `printing_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`printType` varchar(100),
	`designReference` varchar(180),
	`printingTarget` int NOT NULL DEFAULT 0,
	`printedQuantity` int NOT NULL DEFAULT 0,
	`rejectedQuantity` int NOT NULL DEFAULT 0,
	`printingDate` timestamp NOT NULL,
	`printingStaffId` int NOT NULL,
	`status` enum('NOT REQUIRED','PENDING','IN PROGRESS','COMPLETED') NOT NULL DEFAULT 'PENDING',
	`remarks` text,
	`isDemo` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `printing_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `qc_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`qcDate` timestamp NOT NULL,
	`checkedQuantity` int NOT NULL,
	`passedQuantity` int NOT NULL,
	`failedQuantity` int NOT NULL,
	`reworkQuantity` int NOT NULL,
	`qcStaffId` int NOT NULL,
	`defectType` varchar(120),
	`status` enum('PENDING','IN PROGRESS','PASSED','REWORK REQUIRED','FAILED') NOT NULL DEFAULT 'PENDING',
	`remarks` text,
	`isDemo` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `qc_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `printingRequired` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_employeeId_users_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cutting_entries` ADD CONSTRAINT `cutting_entries_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cutting_entries` ADD CONSTRAINT `cutting_entries_cuttingStaffId_users_id_fk` FOREIGN KEY (`cuttingStaffId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `delivery_entries` ADD CONSTRAINT `delivery_entries_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `packing_entries` ADD CONSTRAINT `packing_entries_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `packing_entries` ADD CONSTRAINT `packing_entries_packingStaffId_users_id_fk` FOREIGN KEY (`packingStaffId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `printing_entries` ADD CONSTRAINT `printing_entries_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `printing_entries` ADD CONSTRAINT `printing_entries_printingStaffId_users_id_fk` FOREIGN KEY (`printingStaffId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `qc_entries` ADD CONSTRAINT `qc_entries_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `qc_entries` ADD CONSTRAINT `qc_entries_qcStaffId_users_id_fk` FOREIGN KEY (`qcStaffId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `attendance_date_idx` ON `attendance` (`attendanceDate`);--> statement-breakpoint
CREATE INDEX `attendance_employee_idx` ON `attendance` (`employeeId`);--> statement-breakpoint
CREATE INDEX `cutting_order_idx` ON `cutting_entries` (`orderId`);--> statement-breakpoint
CREATE INDEX `cutting_date_idx` ON `cutting_entries` (`cuttingDate`);--> statement-breakpoint
CREATE INDEX `delivery_order_idx` ON `delivery_entries` (`orderId`);--> statement-breakpoint
CREATE INDEX `delivery_date_idx` ON `delivery_entries` (`deliveryDate`);--> statement-breakpoint
CREATE INDEX `packing_order_idx` ON `packing_entries` (`orderId`);--> statement-breakpoint
CREATE INDEX `packing_date_idx` ON `packing_entries` (`packingDate`);--> statement-breakpoint
CREATE INDEX `printing_order_idx` ON `printing_entries` (`orderId`);--> statement-breakpoint
CREATE INDEX `printing_date_idx` ON `printing_entries` (`printingDate`);--> statement-breakpoint
CREATE INDEX `qc_order_idx` ON `qc_entries` (`orderId`);--> statement-breakpoint
CREATE INDEX `qc_date_idx` ON `qc_entries` (`qcDate`);