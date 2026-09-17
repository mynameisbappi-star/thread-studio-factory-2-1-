CREATE TABLE `expenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`expenseDate` timestamp NOT NULL,
	`category` enum('FACTORY','TRANSPORT','ELECTRICITY','MAINTENANCE','PRINTING','MATERIALS','PACKAGING','MARKETING','OFFICE','OTHER') NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`paymentMethod` enum('CASH','BANK','MOBILE BANKING','OTHER') NOT NULL,
	`description` varchar(240) NOT NULL,
	`recordedBy` int NOT NULL,
	`notes` text,
	`isDemo` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`paymentCode` varchar(40) NOT NULL,
	`orderId` int NOT NULL,
	`customerId` int NOT NULL,
	`paymentDate` timestamp NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`paymentMethod` enum('CASH','BANK','MOBILE BANKING','OTHER') NOT NULL,
	`reference` varchar(160),
	`receivedBy` int NOT NULL,
	`notes` text,
	`isDemo` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `payments_code_unique` UNIQUE(`paymentCode`)
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `orderValue` decimal(14,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `estimatedCost` decimal(14,2);--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_recordedBy_users_id_fk` FOREIGN KEY (`recordedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_customerId_customers_id_fk` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_receivedBy_users_id_fk` FOREIGN KEY (`receivedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `expenses_date_idx` ON `expenses` (`expenseDate`);--> statement-breakpoint
CREATE INDEX `expenses_category_idx` ON `expenses` (`category`);--> statement-breakpoint
CREATE INDEX `payments_order_idx` ON `payments` (`orderId`);--> statement-breakpoint
CREATE INDEX `payments_customer_idx` ON `payments` (`customerId`);--> statement-breakpoint
CREATE INDEX `payments_date_idx` ON `payments` (`paymentDate`);