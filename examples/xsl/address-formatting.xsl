<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" 
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:fo="http://www.w3.org/1999/XSL/Format">

  <!-- Address formatting templates -->

  <!-- Format full address block -->
  <xsl:template name="format-address">
    <xsl:param name="address"/>
    <fo:block font-size="10pt" color="#333333">
      <xsl:value-of select="$address/street"/>
    </fo:block>
    <fo:block font-size="10pt" color="#333333">
      <xsl:value-of select="$address/city"/>
      <xsl:if test="$address/state">
        <xsl:text>, </xsl:text>
        <xsl:value-of select="$address/state"/>
      </xsl:if>
      <xsl:text> </xsl:text>
      <xsl:value-of select="$address/zipCode"/>
    </fo:block>
    <fo:block font-size="10pt" color="#333333">
      <xsl:value-of select="$address/country"/>
    </fo:block>
  </xsl:template>

  <!-- Format contact information -->
  <xsl:template name="format-contact">
    <xsl:param name="contact"/>
    <fo:block font-size="10pt" color="#333333" space-before="5pt">
      Email: <xsl:value-of select="$contact/email"/>
    </fo:block>
    <fo:block font-size="10pt" color="#333333">
      Phone: <xsl:value-of select="$contact/phone"/>
    </fo:block>
    <xsl:if test="$contact/fax">
      <fo:block font-size="10pt" color="#333333">
        Fax: <xsl:value-of select="$contact/fax"/>
      </fo:block>
    </xsl:if>
  </xsl:template>

</xsl:stylesheet>
