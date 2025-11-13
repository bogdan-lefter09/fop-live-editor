<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" 
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:fo="http://www.w3.org/1999/XSL/Format"
  xmlns:inv="http://example.com/invoice"
  xmlns:addr="http://example.com/address"
  xmlns:cont="http://example.com/contact"
  exclude-result-prefixes="inv addr cont">

  <!-- Import other XSL stylesheets - MUST come first -->
  <xsl:import href="common-layout.xsl"/>
  <xsl:import href="common-formatting.xsl"/>
  <xsl:import href="address-formatting.xsl"/>

  <xsl:output method="xml" indent="yes"/>

  <!-- Root template -->
  <xsl:template match="/">
    <fo:root>
      <!-- Page layout using imported template -->
      <fo:layout-master-set>
        <xsl:call-template name="page-master-a4"/>
      </fo:layout-master-set>

      <!-- Page sequence -->
      <fo:page-sequence master-reference="A4">
        <!-- Header using imported template -->
        <xsl:call-template name="page-header">
          <xsl:with-param name="title" select="concat('Invoice Date: ', inv:invoice/inv:invoiceDate)"/>
        </xsl:call-template>

        <!-- Footer using imported template -->
        <xsl:call-template name="page-footer"/>

        <!-- Body -->
        <fo:flow flow-name="xsl-region-body">
          <xsl:apply-templates select="inv:invoice"/>
        </fo:flow>
      </fo:page-sequence>
    </fo:root>
  </xsl:template>

  <!-- Invoice template -->
  <xsl:template match="inv:invoice">
    <!-- Company Header -->
    <fo:block font-size="24pt" font-weight="bold" color="#003366" space-after="5pt">
      INVOICE
    </fo:block>
    
    <fo:block font-size="11pt" color="#666666" space-after="20pt">
      Invoice #<xsl:value-of select="inv:invoiceNumber"/>
    </fo:block>

    <!-- Customer Information using imported templates -->
    <fo:block space-after="20pt">
      <!-- Use section heading template -->
      <xsl:call-template name="section-heading">
        <xsl:with-param name="text" select="'Bill To:'"/>
      </xsl:call-template>
      
      <fo:block font-size="11pt" font-weight="bold">
        <xsl:value-of select="inv:customer/inv:name"/>
      </fo:block>
      
      <fo:block font-size="10pt" color="#333333">
        Customer ID: <xsl:value-of select="inv:customer/inv:customerId"/>
      </fo:block>
      
      <!-- Use address formatting template -->
      <fo:block space-before="5pt">
        <xsl:call-template name="format-address">
          <xsl:with-param name="address" select="inv:customer/inv:address"/>
        </xsl:call-template>
      </fo:block>
      
      <!-- Use contact formatting template -->
      <xsl:call-template name="format-contact">
        <xsl:with-param name="contact" select="inv:customer/inv:contact"/>
      </xsl:call-template>
    </fo:block>

    <!-- Items Table -->
    <fo:block space-before="20pt" space-after="15pt">
      <fo:table table-layout="fixed" width="100%" border="1pt solid #cccccc">
        <fo:table-column column-width="15%"/>
        <fo:table-column column-width="40%"/>
        <fo:table-column column-width="15%"/>
        <fo:table-column column-width="15%"/>
        <fo:table-column column-width="15%"/>
        
        <!-- Table Header using imported template -->
        <fo:table-header>
          <fo:table-row>
            <xsl:call-template name="table-header-cell">
              <xsl:with-param name="text" select="'Item ID'"/>
            </xsl:call-template>
            <xsl:call-template name="table-header-cell">
              <xsl:with-param name="text" select="'Description'"/>
            </xsl:call-template>
            <xsl:call-template name="table-header-cell">
              <xsl:with-param name="text" select="'Qty'"/>
              <xsl:with-param name="align" select="'right'"/>
            </xsl:call-template>
            <xsl:call-template name="table-header-cell">
              <xsl:with-param name="text" select="'Unit Price'"/>
              <xsl:with-param name="align" select="'right'"/>
            </xsl:call-template>
            <xsl:call-template name="table-header-cell">
              <xsl:with-param name="text" select="'Total'"/>
              <xsl:with-param name="align" select="'right'"/>
            </xsl:call-template>
          </fo:table-row>
        </fo:table-header>
        
        <!-- Table Body -->
        <fo:table-body>
          <xsl:apply-templates select="inv:items/inv:item"/>
        </fo:table-body>
      </fo:table>
    </fo:block>

    <!-- Summary -->
    <fo:block space-before="10pt">
      <fo:table table-layout="fixed" width="40%" float="right">
        <fo:table-column column-width="60%"/>
        <fo:table-column column-width="40%"/>
        
        <fo:table-body>
          <fo:table-row>
            <fo:table-cell padding="5pt">
              <fo:block font-size="11pt" text-align="right">Subtotal:</fo:block>
            </fo:table-cell>
            <fo:table-cell padding="5pt">
              <fo:block font-size="11pt" text-align="right">
                <xsl:call-template name="format-currency">
                  <xsl:with-param name="amount" select="inv:summary/inv:subtotal"/>
                </xsl:call-template>
              </fo:block>
            </fo:table-cell>
          </fo:table-row>
          
          <fo:table-row>
            <fo:table-cell padding="5pt">
              <fo:block font-size="11pt" text-align="right">
                Tax (<xsl:value-of select="format-number(inv:summary/inv:taxRate * 100, '0.0')"/>%):
              </fo:block>
            </fo:table-cell>
            <fo:table-cell padding="5pt">
              <fo:block font-size="11pt" text-align="right">
                <xsl:call-template name="format-currency">
                  <xsl:with-param name="amount" select="inv:summary/inv:taxAmount"/>
                </xsl:call-template>
              </fo:block>
            </fo:table-cell>
          </fo:table-row>
          
          <fo:table-row background-color="#f0f0f0">
            <fo:table-cell padding="8pt" border-top="2pt solid #003366">
              <fo:block font-size="12pt" font-weight="bold" text-align="right">Total:</fo:block>
            </fo:table-cell>
            <fo:table-cell padding="8pt" border-top="2pt solid #003366">
              <fo:block font-size="12pt" font-weight="bold" text-align="right">
                <xsl:call-template name="format-currency">
                  <xsl:with-param name="amount" select="inv:summary/inv:total"/>
                </xsl:call-template>
              </fo:block>
            </fo:table-cell>
          </fo:table-row>
        </fo:table-body>
      </fo:table>
    </fo:block>

    <!-- Payment Terms -->
    <fo:block space-before="30pt" font-size="10pt" color="#666666">
      <fo:block font-weight="bold">Payment Terms:</fo:block>
      <fo:block><xsl:value-of select="inv:paymentTerms"/></fo:block>
    </fo:block>

    <!-- Notes -->
    <xsl:if test="inv:notes">
      <fo:block space-before="15pt" font-size="10pt" color="#666666" font-style="italic">
        <xsl:value-of select="inv:notes"/>
      </fo:block>
    </xsl:if>
    
    <!-- Last page marker for footer page numbering -->
    <fo:block id="last-page"/>
  </xsl:template>

  <!-- Item template using imported formatting -->
  <xsl:template match="inv:item">
    <fo:table-row>
      <xsl:call-template name="table-data-cell">
        <xsl:with-param name="text" select="inv:itemId"/>
      </xsl:call-template>
      <xsl:call-template name="table-data-cell">
        <xsl:with-param name="text" select="inv:description"/>
      </xsl:call-template>
      <xsl:call-template name="table-data-cell">
        <xsl:with-param name="text" select="inv:quantity"/>
        <xsl:with-param name="align" select="'right'"/>
      </xsl:call-template>
      <fo:table-cell padding="6pt" border="1pt solid #cccccc">
        <fo:block font-size="9pt" text-align="right">
          <xsl:call-template name="format-currency">
            <xsl:with-param name="amount" select="inv:unitPrice"/>
          </xsl:call-template>
        </fo:block>
      </fo:table-cell>
      <fo:table-cell padding="6pt" border="1pt solid #cccccc">
        <fo:block font-size="9pt" text-align="right">
          <xsl:call-template name="format-currency">
            <xsl:with-param name="amount" select="inv:totalPrice"/>
          </xsl:call-template>
        </fo:block>
      </fo:table-cell>
    </fo:table-row>
  </xsl:template>
  
  <!-- Add last-page marker for page numbering -->
  <xsl:template match="inv:invoice" mode="after">
    <fo:block id="last-page"/>
  </xsl:template>

</xsl:stylesheet>
