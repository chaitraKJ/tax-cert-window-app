-- phpMyAdmin SQL Dump
-- version 4.7.1
-- https://www.phpmyadmin.net/
--
-- Host: sql12.freesqldatabase.com
-- Generation Time: Jun 09, 2025 at 11:19 AM
-- Server version: 5.5.62-0ubuntu0.14.04.1
-- PHP Version: 7.0.33-0ubuntu0.16.04.16

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET AUTOCOMMIT = 0;
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `sql12775149`
--

-- --------------------------------------------------------

--
-- Table structure for table `county`
--

CREATE TABLE `county` (
  `id` int(100) NOT NULL,
  `state_name` varchar(50) NOT NULL,
  `state_code` varchar(5) NOT NULL,
  `county_name` varchar(100) NOT NULL,
  `property_tax_link` varchar(255) NOT NULL,
  `path` varchar(100) NOT NULL,
  `status` varchar(10) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

--
-- Dumping data for table `county`
--

INSERT INTO `county` (`id`, `state_name`, `state_code`, `county_name`, `property_tax_link`, `path`, `status`) VALUES
(1, 'Alabama', 'AL', 'Baldwin', 'https://baldwinproperty.countygovservices.com/Property/Search', '/tax/AL/baldwin', '1'),
(2, 'Florida', 'FL', 'Brevard', 'https://county-taxes.net/brevard/property-tax', '/tax/FL/brevard', '1'),
(3, 'Florida', 'FL', 'Broward', 'https://county-taxes.net/broward/property-tax', '/tax/FL/broward', '1'),
(4, 'Florida', 'FL', 'Columbia', 'https://columbia.floridatax.us/AccountSearch?s=pt', '/tax/FL/columbia', '1'),
(5, 'Florida', 'FL', 'Duval', 'https://county-taxes.net/fl-duval/property-tax', '/tax/FL/duval', '1'),
(6, 'Florida', 'FL', 'Flagler', 'https://county-taxes.net/fl-flagler/property-tax', '/tax/FL/flagler', '1'),
(7, 'Florida', 'FL', 'Lee', 'https://county-taxes.net/fl-lee/property-tax', '/tax/FL/lee', '1'),
(8, 'Florida', 'FL', 'Miami-Dade', 'https://county-taxes.net/fl-miamidade/property-tax', '/tax/FL/miami-dade', '1'),
(9, 'Florida', 'FL', 'Orange', 'https://county-taxes.net/fl-orange/property-tax', '/tax/FL/orange', '1'),
(10, 'Florida', 'FL', 'Palm-Beach', 'https://pbctax.publicaccessnow.com/PropertyTax.aspx', '/tax/FL/palm-beach', '1'),
(11, 'Florida', 'FL', 'Sarasota', 'https://sarasotataxcollector.publicaccessnow.com/TaxCollector/PropertyTaxSearch.aspx', '/tax/FL/sarasota', '1'),
(12, 'Arizona', 'AZ', 'Maricopa', 'https://treasurer.maricopa.gov/', '/tax/AZ/maricopa', '1'),
(13, 'California', 'CA', 'Los-Angeles', 'https://vcheck.ttc.lacounty.gov/proptax.php?page=screen', '/tax/CA/los-angeles', '1'),
(14, 'California', 'CA', 'San-Diego', 'https://wps.sdttc.com/webpayments/CoSDTreasurer2/search', '/tax/CA/san-diego', '1'),
(15, 'Colorado', 'CO', 'Jefferson', 'https://treasurerpropertysearch.jeffco.us/propertyrecordssearch/ain', '/tax/CO/jefferson', '1'),
(16, 'Colorado', 'CO', 'Boulder', 'https://treasurer.bouldercounty.org/treasurer/web/login.jsp', '/tax/CO/boulder', '1'),
(17, 'Florida', 'FL', 'Citrus', 'https://county-taxes.net/citrus/property-tax', '/tax/FL/citrus', '1'),
(18, 'Colorado', 'CO', 'Douglas', 'https://apps.douglas.co.us/treasurer/treasurerweb/search.jsp', '/tax/CO/douglas', '1'),
(19, 'California', 'CA', 'San-Bernardino', 'https://www.mytaxcollector.com/trSearch.aspx', '/tax/CA/san-bernardino', '1'),
(20, 'California', 'CA', 'Contra-Costa', 'https://taxcolp.cccttc.us/lookup/', '/tax/CA/contra-costa', '1');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(100) NOT NULL,
  `type` varchar(10) NOT NULL,
  `name` varchar(100) NOT NULL,
  `employee_id` varchar(20) NOT NULL,
  `password` varchar(255) NOT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `type`, `name`, `employee_id`, `password`, `created_at`, `updated_at`) VALUES
(1, 'Admin', 'Jane Doe', 'INV011', '$2b$10$WF9UStgaGx2myw1uREwnle1V3YCZ2LiQknO.Y5sRmFuUwV84JMj7a', '2025-04-24 11:02:34', '2025-04-24 11:02:34');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `county`
--
ALTER TABLE `county`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `county`
--
ALTER TABLE `county`
  MODIFY `id` int(100) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=21;
--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(100) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;