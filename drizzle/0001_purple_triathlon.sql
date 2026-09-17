CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerName` varchar(180) NOT NULL,
	`companyName` varchar(180),
	`phone` varchar(40),
	`whatsapp` varchar(40),
	`email` varchar(320),
	`country` varchar(80),
	`customerType` enum('LOCAL','INTERNATIONAL','BUYER','BRAND','RESELLER','OTHER') NOT NULL DEFAULT 'LOCAL',
	`notes` text,
	`isDemo` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `daily_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reportDate` timestamp NOT NULL,
	`reportType` enum('MORNING','CLOSING') NOT NULL,
	`managerId` int NOT NULL,
	`presentWorkers` int NOT NULL DEFAULT 0,
	`absentWorkers` int NOT NULL DEFAULT 0,
	`lateWorkers` int NOT NULL DEFAULT 0,
	`todaysProductionTarget` int NOT NULL DEFAULT 0,
	`pendingProduction` int NOT NULL DEFAULT 0,
	`importantIssues` text,
	`actualProduction` int NOT NULL DEFAULT 0,
	`goodProduction` int NOT NULL DEFAULT 0,
	`rejectedProduction` int NOT NULL DEFAULT 0,
	`ordersCompleted` int NOT NULL DEFAULT 0,
	`issues` text,
	`deliveryRequirement` text,
	`managerRemarks` text,
	`isDemo` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `daily_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `daily_reports_date_type_unique` UNIQUE(`reportDate`,`reportType`)
);
--> statement-breakpoint
CREATE TABLE `order_sizes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`size` varchar(20) NOT NULL,
	`quantity` int NOT NULL,
	CONSTRAINT `order_sizes_id` PRIMARY KEY(`id`),
	CONSTRAINT `order_sizes_order_size_unique` UNIQUE(`orderId`,`size`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderCode` varchar(40) NOT NULL,
	`customerId` int NOT NULL,
	`orderDate` timestamp NOT NULL,
	`deliveryDate` timestamp NOT NULL,
	`product` varchar(180) NOT NULL,
	`productType` varchar(100),
	`styleSku` varchar(100),
	`totalQuantity` int NOT NULL,
	`sewingCharge` decimal(12,2) NOT NULL DEFAULT '0',
	`printingCharge` decimal(12,2) NOT NULL DEFAULT '0',
	`otherCharge` decimal(12,2) NOT NULL DEFAULT '0',
	`advance` decimal(12,2) NOT NULL DEFAULT '0',
	`notes` text,
	`status` enum('DRAFT','CONFIRMED','IN PRODUCTION','PRODUCTION COMPLETED','QC','READY','DELIVERED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
	`isDemo` boolean NOT NULL DEFAULT false,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_code_unique` UNIQUE(`orderCode`)
);
--> statement-breakpoint
CREATE TABLE `production_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`productionDate` timestamp NOT NULL,
	`productionTarget` int NOT NULL,
	`actualProduction` int NOT NULL,
	`rejectedQuantity` int NOT NULL,
	`operatorId` int NOT NULL,
	`remarks` text,
	`isDemo` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `production_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('owner','manager','factory_staff','user','admin') NOT NULL DEFAULT 'factory_staff';--> statement-breakpoint
ALTER TABLE `daily_reports` ADD CONSTRAINT `daily_reports_managerId_users_id_fk` FOREIGN KEY (`managerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_sizes` ADD CONSTRAINT `order_sizes_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_customerId_customers_id_fk` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `production_entries` ADD CONSTRAINT `production_entries_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `production_entries` ADD CONSTRAINT `production_entries_operatorId_users_id_fk` FOREIGN KEY (`operatorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `customers_name_idx` ON `customers` (`customerName`);--> statement-breakpoint
CREATE INDEX `customers_type_idx` ON `customers` (`customerType`);--> statement-breakpoint
CREATE INDEX `daily_reports_date_idx` ON `daily_reports` (`reportDate`);--> statement-breakpoint
CREATE INDEX `order_sizes_order_idx` ON `order_sizes` (`orderId`);--> statement-breakpoint
CREATE INDEX `orders_customer_idx` ON `orders` (`customerId`);--> statement-breakpoint
CREATE INDEX `orders_delivery_idx` ON `orders` (`deliveryDate`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `production_date_idx` ON `production_entries` (`productionDate`);--> statement-breakpoint
CREATE INDEX `production_order_idx` ON `production_entries` (`orderId`);--> statement-breakpoint
CREATE INDEX `production_operator_idx` ON `production_entries` (`operatorId`);